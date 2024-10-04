import { afterAll, describe, expect, test } from "bun:test";
import type { Account as ApiAccount } from "@versia/client/types";
import { fakeRequest, getTestUsers } from "~/tests/utils";
import { meta } from "./index.ts";

const { users, deleteUsers } = await getTestUsers(5);

afterAll(async () => {
    await deleteUsers();
});

// /api/v1/accounts/id
describe(meta.route, () => {
    test("should correctly get user from username", async () => {
        const response = await fakeRequest(
            `${meta.route}?username=${users[0].data.username}`,
        );

        expect(response.status).toBe(200);

        const data = (await response.json()) as ApiAccount;

        expect(data.id).toBe(users[0].id);
    });

    test("should return 404 for non-existent user", async () => {
        const response = await fakeRequest(
            `${meta.route}?username=${users[0].data.username}-nonexistent`,
        );

        expect(response.status).toBe(404);
    });
});
