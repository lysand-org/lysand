/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getConfig } from "@config";
import type { Token } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { client } from "~database/datasource";
import { TokenType } from "~database/entities/Token";
import {
	type UserWithRelations,
	createNewLocalUser,
} from "~database/entities/User";
import type { APIEmoji } from "~types/entities/emoji";
import type { APIInstance } from "~types/entities/instance";

const config = getConfig();

let token: Token;
let user: UserWithRelations;

describe("API Tests", () => {
	beforeAll(async () => {
		// Initialize test user
		user = await createNewLocalUser({
			email: "test@test.com",
			username: "test",
			password: "test",
			display_name: "",
		});

		token = await client.token.create({
			data: {
				access_token: "test",
				application: {
					create: {
						client_id: "test",
						name: "Test Application",
						redirect_uris: "https://example.com",
						scopes: "read write",
						secret: "test",
						website: "https://example.com",
						vapid_key: null,
					},
				},
				code: "test",
				scope: "read write",
				token_type: TokenType.BEARER,
				user: {
					connect: {
						id: user.id,
					},
				},
			},
		});
	});

	afterAll(async () => {
		await client.user.deleteMany({
			where: {
				username: {
					in: ["test", "test2"],
				},
			},
		});
	});

	describe("GET /api/v1/instance", () => {
		test("should return an APIInstance object", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/instance`,
				{
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const instance = (await response.json()) as APIInstance;

			expect(instance.uri).toBe(new URL(config.http.base_url).hostname);
			expect(instance.title).toBeDefined();
			expect(instance.description).toBeDefined();
			expect(instance.email).toBeDefined();
			expect(instance.version).toBeDefined();
			expect(instance.urls).toBeDefined();
			expect(instance.stats).toBeDefined();
			expect(instance.thumbnail).toBeDefined();
			expect(instance.languages).toBeDefined();
			// Not implemented yet
			// expect(instance.contact_account).toBeDefined();
			expect(instance.rules).toBeDefined();
			expect(instance.approval_required).toBeDefined();
			expect(instance.max_toot_chars).toBeDefined();
		});
	});

	describe("GET /api/v1/custom_emojis", () => {
		beforeAll(async () => {
			await client.emoji.create({
				data: {
					instanceId: null,
					url: "https://example.com/test.png",
					content_type: "image/png",
					shortcode: "test",
					visible_in_picker: true,
				},
			});
		});
		test("should return an array of at least one custom emoji", async () => {
			const response = await fetch(
				`${config.http.base_url}/api/v1/custom_emojis`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.access_token}`,
					},
				}
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe(
				"application/json"
			);

			const emojis = (await response.json()) as APIEmoji[];

			expect(emojis.length).toBeGreaterThan(0);
			expect(emojis[0].shortcode).toBe("test");
			expect(emojis[0].url).toBe("https://example.com/test.png");
		});
		afterAll(async () => {
			await client.emoji.deleteMany({
				where: {
					shortcode: "test",
				},
			});
		});
	});
});
