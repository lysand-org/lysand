import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fakeRequest, getTestUsers } from "~/tests/utils";
import { meta } from "./index.ts";

const { users, tokens, deleteUsers } = await getTestUsers(3);

afterAll(async () => {
    await deleteUsers();
});

beforeAll(async () => {
    const response = await fakeRequest(
        `/api/v1/accounts/${users[1].id}/mute`,

        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokens[0].accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        },
    );
    expect(response.status).toBe(200);
});

// /api/v1/mutes
describe(meta.route, () => {
    test("should return 401 if not authenticated", async () => {
        const response = await fakeRequest(
            meta.route.replace(":id", users[1].id),

            {
                method: "GET",
            },
        );
        expect(response.status).toBe(401);
    });

    test("should return mutes", async () => {
        const response = await fakeRequest(meta.route, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokens[0].accessToken}`,
            },
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: users[1].id,
                }),
            ]),
        );
    });

    test("should return mutes after unmute", async () => {
        const response = await fakeRequest(
            `/api/v1/accounts/${users[1].id}/unmute`,

            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tokens[0].accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            },
        );
        expect(response.status).toBe(200);

        const response2 = await fakeRequest(meta.route, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokens[0].accessToken}`,
            },
        });
        expect(response2.status).toBe(200);
        const body = await response2.json();
        expect(body).toEqual([]);
    });
});
