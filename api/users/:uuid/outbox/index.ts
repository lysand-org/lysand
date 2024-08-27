import { apiRoute, applyConfig, handleZodError } from "@/api";
import { zValidator } from "@hono/zod-validator";
import type { Collection } from "@versia/federation/types";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/drizzle/db";
import { Notes } from "~/drizzle/schema";
import { config } from "~/packages/config-manager";
import { Note } from "~/packages/database-interface/note";
import { User } from "~/packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["GET"],
    auth: {
        required: false,
    },
    ratelimits: {
        duration: 60,
        max: 500,
    },
    route: "/users/:uuid/outbox",
});

export const schemas = {
    param: z.object({
        uuid: z.string().uuid(),
    }),
    query: z.object({
        page: z.string().optional(),
    }),
};

const NOTES_PER_PAGE = 20;

export default apiRoute((app) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        zValidator("param", schemas.param, handleZodError),
        zValidator("query", schemas.query, handleZodError),
        async (context) => {
            const { uuid } = context.req.valid("param");

            const author = await User.fromId(uuid);

            if (!author) {
                return context.json({ error: "User not found" }, 404);
            }

            if (author.isRemote()) {
                return context.json(
                    { error: "Cannot view users from remote instances" },
                    403,
                );
            }

            const pageNumber = Number(context.req.valid("query").page) || 1;

            const notes = await Note.manyFromSql(
                and(
                    eq(Notes.authorId, uuid),
                    inArray(Notes.visibility, ["public", "unlisted"]),
                ),
                undefined,
                NOTES_PER_PAGE,
                NOTES_PER_PAGE * (pageNumber - 1),
            );

            const totalNotes = (
                await db
                    .select({
                        count: count(),
                    })
                    .from(Notes)
                    .where(
                        and(
                            eq(Notes.authorId, uuid),
                            inArray(Notes.visibility, ["public", "unlisted"]),
                        ),
                    )
            )[0].count;

            const json = {
                first: new URL(
                    `/users/${uuid}/outbox?page=1`,
                    config.http.base_url,
                ).toString(),
                last: new URL(
                    `/users/${uuid}/outbox?page=${Math.ceil(
                        totalNotes / NOTES_PER_PAGE,
                    )}`,
                    config.http.base_url,
                ).toString(),
                total: totalNotes,
                author: author.getUri(),
                next:
                    notes.length === NOTES_PER_PAGE
                        ? new URL(
                              `/users/${uuid}/outbox?page=${pageNumber + 1}`,
                              config.http.base_url,
                          ).toString()
                        : null,
                previous:
                    pageNumber > 1
                        ? new URL(
                              `/users/${uuid}/outbox?page=${pageNumber - 1}`,
                              config.http.base_url,
                          ).toString()
                        : null,
                items: notes.map((note) => note.toVersia()),
            } satisfies Collection;

            const { headers } = await author.sign(json, context.req.url, "GET");

            return context.json(json, 200, headers.toJSON());
        },
    ),
);