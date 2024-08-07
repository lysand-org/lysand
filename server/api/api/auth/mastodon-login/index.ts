import { applyConfig, handleZodError } from "@/api";
import { randomString } from "@/math";
import { response } from "@/response";
import type { Hono } from "@hono/hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { TokenType } from "~/classes/functions/token";
import { db } from "~/drizzle/db";
import { Tokens, Users } from "~/drizzle/schema";
import { config } from "~/packages/config-manager";
import { User } from "~/packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 4,
        duration: 60,
    },
    route: "/api/auth/mastodon-logout",
    auth: {
        required: false,
    },
});

export const schemas = {
    form: z.object({
        user: z.object({
            email: z.string().email().toLowerCase(),
            password: z.string().min(2).max(100),
        }),
    }),
};

/**
 * Mastodon-FE login route
 */
export default (app: Hono) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        zValidator("form", schemas.form, handleZodError),
        async (context) => {
            const {
                user: { email, password },
            } = context.req.valid("form");

            const redirectToLogin = (error: string) =>
                response(null, 302, {
                    Location: `/auth/sign_in?${new URLSearchParams({
                        ...context.req.query,
                        error: encodeURIComponent(error),
                    }).toString()}`,
                });

            const user = await User.fromSql(eq(Users.email, email));

            if (
                !(
                    user &&
                    (await Bun.password.verify(
                        password,
                        user.data.password || "",
                    ))
                )
            ) {
                return redirectToLogin("Invalid email or password");
            }

            if (user.data.passwordResetToken) {
                return response(null, 302, {
                    Location: new URL(
                        `${
                            config.frontend.routes.password_reset
                        }?${new URLSearchParams({
                            token: user.data.passwordResetToken ?? "",
                            login_reset: "true",
                        }).toString()}`,
                        config.http.base_url,
                    ).toString(),
                });
            }

            const code = randomString(32, "hex");
            const accessToken = randomString(64, "base64url");

            await db.insert(Tokens).values({
                accessToken,
                code: code,
                scope: "read write follow push",
                tokenType: TokenType.Bearer,
                applicationId: null,
                userId: user.id,
            });

            // One week from now
            const maxAge = String(60 * 60 * 24 * 7);

            // Redirect to home
            return response(null, 303, {
                Location: "/",
                "Set-Cookie": `_session_id=${accessToken}; Domain=${
                    new URL(config.http.base_url).hostname
                }; SameSite=Lax; Path=/; HttpOnly; Max-Age=${maxAge}`,
            });
        },
    );
