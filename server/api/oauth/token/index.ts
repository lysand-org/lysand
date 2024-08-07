import { applyConfig, handleZodError, jsonOrForm } from "@/api";
import { jsonResponse } from "@/response";
import type { Hono } from "@hono/hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/drizzle/db";
import { Tokens } from "~/drizzle/schema";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    auth: {
        required: false,
    },
    ratelimits: {
        duration: 60,
        max: 10,
    },
    route: "/oauth/token",
});

export const schemas = {
    json: z.object({
        code: z.string().optional(),
        code_verifier: z.string().optional(),
        grant_type: z
            .enum([
                "authorization_code",
                "refresh_token",
                "client_credentials",
                "password",
                "urn:ietf:params:oauth:grant-type:device_code",
                "urn:ietf:params:oauth:grant-type:token-exchange",
                "urn:ietf:params:oauth:grant-type:saml2-bearer",
                "urn:openid:params:grant-type:ciba",
            ])
            .default("authorization_code"),
        client_id: z.string().optional(),
        client_secret: z.string().optional(),
        username: z.string().trim().optional(),
        password: z.string().trim().optional(),
        redirect_uri: z.string().url().optional(),
        refresh_token: z.string().optional(),
        scope: z.string().optional(),
        assertion: z.string().optional(),
        audience: z.string().optional(),
        subject_token_type: z.string().optional(),
        subject_token: z.string().optional(),
        actor_token_type: z.string().optional(),
        actor_token: z.string().optional(),
        auth_req_id: z.string().optional(),
    }),
};

const returnError = (error: string, description: string) =>
    jsonResponse(
        {
            error,
            error_description: description,
        },
        401,
    );

export default (app: Hono) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        jsonOrForm(),
        zValidator("json", schemas.json, handleZodError),
        async (context) => {
            const { grant_type, code, redirect_uri, client_id, client_secret } =
                context.req.valid("json");

            switch (grant_type) {
                case "authorization_code": {
                    if (!code) {
                        return returnError(
                            "invalid_request",
                            "Code is required",
                        );
                    }

                    if (!redirect_uri) {
                        return returnError(
                            "invalid_request",
                            "Redirect URI is required",
                        );
                    }

                    if (!client_id) {
                        return returnError(
                            "invalid_client",
                            "Client ID is required",
                        );
                    }

                    // Verify the client_secret
                    const client = await db.query.Applications.findFirst({
                        where: (application, { eq }) =>
                            eq(application.clientId, client_id),
                    });

                    if (!client || client.secret !== client_secret) {
                        return returnError(
                            "invalid_client",
                            "Invalid client credentials",
                        );
                    }

                    const token = await db.query.Tokens.findFirst({
                        where: (token, { eq, and }) =>
                            and(
                                eq(token.code, code),
                                eq(token.redirectUri, redirect_uri),
                                eq(token.clientId, client_id),
                            ),
                    });

                    if (!token) {
                        return returnError("invalid_grant", "Code not found");
                    }

                    // Invalidate the code
                    await db
                        .update(Tokens)
                        .set({ code: null })
                        .where(eq(Tokens.id, token.id));

                    return jsonResponse({
                        access_token: token.accessToken,
                        token_type: "Bearer",
                        expires_in: token.expiresAt
                            ? Math.floor(
                                  (new Date(token.expiresAt).getTime() -
                                      Date.now()) /
                                      1000,
                              )
                            : null,
                        id_token: token.idToken,
                        refresh_token: null,
                        scope: token.scope,
                        created_at: Math.floor(
                            new Date(token.createdAt).getTime() / 1000,
                        ),
                    });
                }
            }

            return returnError(
                "unsupported_grant_type",
                "Unsupported grant type",
            );
        },
    );
