import { applyConfig, auth } from "@/api";
import { generateChallenge } from "@/challenges";
import { errorResponse, jsonResponse } from "@/response";
import type { Hono } from "@hono/hono";
import { config } from "~/packages/config-manager";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    route: "/api/v1/challenges",
    ratelimits: {
        max: 10,
        duration: 60,
    },
    auth: {
        required: false,
    },
    permissions: {
        required: [],
    },
});

export default (app: Hono) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        auth(meta.auth, meta.permissions),
        async (_context) => {
            if (!config.validation.challenges.enabled) {
                return errorResponse("Challenges are disabled in config", 400);
            }

            const result = await generateChallenge();

            return jsonResponse({
                id: result.id,
                ...result.challenge,
            });
        },
    );
