import type { APIAccount } from "~types/entities/account";
import type { LysandUser as LysandUser } from "~types/lysand/Object";
import { htmlToText } from "html-to-text";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { client } from "~database/datasource";
import { addEmojiIfNotExists, emojiToAPI, emojiToLysand } from "./Emoji";
import { addInstanceIfNotExists } from "./Instance";
import type { APISource } from "~types/entities/source";
import { addUserToMeilisearch } from "@meilisearch";
import { ConfigManager, type ConfigType } from "config-manager";
import { userRelations } from "./relations";
import { MediaBackendType } from "~packages/media-manager";

const configManager = new ConfigManager({});
const config = await configManager.getConfig();

export interface AuthData {
	user: UserWithRelations | null;
	token: string;
}

/**
 * Represents a user in the database.
 * Stores local and remote users
 */

const userRelations2 = Prisma.validator<Prisma.UserDefaultArgs>()({
	include: userRelations,
});

export type UserWithRelations = Prisma.UserGetPayload<typeof userRelations2>;

/**
 * Get the user's avatar in raw URL format
 * @param config The config to use
 * @returns The raw URL for the user's avatar
 */
export const getAvatarUrl = (user: User, config: ConfigType) => {
	if (!user.avatar) return config.defaults.avatar;
	if (config.media.backend === MediaBackendType.LOCAL) {
		return `${config.http.base_url}/media/${user.avatar}`;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if (config.media.backend === MediaBackendType.S3) {
		return `${config.s3.public_url}/${user.avatar}`;
	}
	return "";
};

/**
 * Get the user's header in raw URL format
 * @param config The config to use
 * @returns The raw URL for the user's header
 */
export const getHeaderUrl = (user: User, config: ConfigType) => {
	if (!user.header) return config.defaults.header;
	if (config.media.backend === MediaBackendType.LOCAL) {
		return `${config.http.base_url}/media/${user.header}`;
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if (config.media.backend === MediaBackendType.S3) {
		return `${config.s3.public_url}/${user.header}`;
	}
	return "";
};

export const getFromRequest = async (req: Request): Promise<AuthData> => {
	// Check auth token
	const token = req.headers.get("Authorization")?.split(" ")[1] || "";

	return { user: await retrieveUserFromToken(token), token };
};

export const fetchRemoteUser = async (uri: string) => {
	// Check if user not already in database
	const foundUser = await client.user.findUnique({
		where: {
			uri,
		},
		include: userRelations,
	});

	if (foundUser) return foundUser;

	const response = await fetch(uri, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
	});

	const data = (await response.json()) as Partial<LysandUser>;

	if (
		!(
			data.id &&
			data.username &&
			data.uri &&
			data.created_at &&
			data.disliked &&
			data.featured &&
			data.liked &&
			data.followers &&
			data.following &&
			data.inbox &&
			data.outbox &&
			data.public_key
		)
	) {
		throw new Error("Invalid user data");
	}

	// Parse emojis and add them to database
	const userEmojis =
		data.extensions?.["org.lysand:custom_emojis"]?.emojis ?? [];

	const user = await client.user.create({
		data: {
			username: data.username,
			uri: data.uri,
			createdAt: new Date(data.created_at),
			endpoints: {
				disliked: data.disliked,
				featured: data.featured,
				liked: data.liked,
				followers: data.followers,
				following: data.following,
				inbox: data.inbox,
				outbox: data.outbox,
			},
			avatar: (data.avatar && data.avatar[0].content) || "",
			header: (data.header && data.header[0].content) || "",
			displayName: data.display_name ?? "",
			note: data.bio?.[0].content ?? "",
			publicKey: data.public_key.public_key,
			source: {
				language: null,
				note: "",
				privacy: "public",
				sensitive: false,
				fields: [],
			},
		},
	});

	// Add to Meilisearch
	await addUserToMeilisearch(user);

	const emojis = [];

	for (const emoji of userEmojis) {
		emojis.push(await addEmojiIfNotExists(emoji));
	}

	const uriData = new URL(data.uri);

	return await client.user.update({
		where: {
			id: user.id,
		},
		data: {
			emojis: {
				connect: emojis.map(emoji => ({
					id: emoji.id,
				})),
			},
			instanceId: (await addInstanceIfNotExists(uriData.origin)).id,
		},
		include: userRelations,
	});
};

/**
 * Fetches the list of followers associated with the actor and updates the user's followers
 */
export const fetchFollowers = () => {
	//
};

/**
 * Creates a new LOCAL user.
 * @param data The data for the new user.
 * @returns The newly created user.
 */
export const createNewLocalUser = async (data: {
	username: string;
	display_name?: string;
	password: string;
	email: string;
	bio?: string;
	avatar?: string;
	header?: string;
	admin?: boolean;
}) => {
	const config = await configManager.getConfig();

	const keys = await generateUserKeys();

	const user = await client.user.create({
		data: {
			username: data.username,
			displayName: data.display_name ?? data.username,
			password: await Bun.password.hash(data.password),
			email: data.email,
			note: data.bio ?? "",
			avatar: data.avatar ?? config.defaults.avatar,
			header: data.header ?? config.defaults.avatar,
			isAdmin: data.admin ?? false,
			uri: "",
			publicKey: keys.public_key,
			privateKey: keys.private_key,
			source: {
				language: null,
				note: "",
				privacy: "public",
				sensitive: false,
				fields: [],
			},
		},
	});

	// Add to Meilisearch
	await addUserToMeilisearch(user);

	return await client.user.update({
		where: {
			id: user.id,
		},
		data: {
			uri: `${config.http.base_url}/users/${user.id}`,
			endpoints: {
				disliked: `${config.http.base_url}/users/${user.id}/disliked`,
				featured: `${config.http.base_url}/users/${user.id}/featured`,
				liked: `${config.http.base_url}/users/${user.id}/liked`,
				followers: `${config.http.base_url}/users/${user.id}/followers`,
				following: `${config.http.base_url}/users/${user.id}/following`,
				inbox: `${config.http.base_url}/users/${user.id}/inbox`,
				outbox: `${config.http.base_url}/users/${user.id}/outbox`,
			},
		},
		include: userRelations,
	});
};

/**
 * Parses mentions from a list of URIs
 */
export const parseMentionsUris = async (mentions: string[]) => {
	return await client.user.findMany({
		where: {
			uri: {
				in: mentions,
			},
		},
		include: userRelations,
	});
};

/**
 * Retrieves a user from a token.
 * @param access_token The access token to retrieve the user from.
 * @returns The user associated with the given access token.
 */
export const retrieveUserFromToken = async (access_token: string) => {
	if (!access_token) return null;

	const token = await client.token.findFirst({
		where: {
			access_token,
		},
		include: {
			user: {
				include: userRelations,
			},
		},
	});

	if (!token) return null;

	return token.user;
};

/**
 * Gets the relationship to another user.
 * @param other The other user to get the relationship to.
 * @returns The relationship to the other user.
 */
export const getRelationshipToOtherUser = async (
	user: UserWithRelations,
	other: User
) => {
	return await client.relationship.findFirst({
		where: {
			ownerId: user.id,
			subjectId: other.id,
		},
	});
};

/**
 * Generates keys for the user.
 */
export const generateUserKeys = async () => {
	const keys = await crypto.subtle.generateKey("Ed25519", true, [
		"sign",
		"verify",
	]);

	const privateKey = btoa(
		String.fromCharCode.apply(null, [
			...new Uint8Array(
				// jesus help me what do these letters mean
				await crypto.subtle.exportKey("pkcs8", keys.privateKey)
			),
		])
	);
	const publicKey = btoa(
		String.fromCharCode(
			...new Uint8Array(
				// why is exporting a key so hard
				await crypto.subtle.exportKey("spki", keys.publicKey)
			)
		)
	);

	// Add header, footer and newlines later on
	// These keys are base64 encrypted
	return {
		private_key: privateKey,
		public_key: publicKey,
	};
};

export const userToAPI = (
	user: UserWithRelations,
	isOwnAccount = false
): APIAccount => {
	return {
		id: user.id,
		username: user.username,
		display_name: user.displayName,
		note: user.note,
		url: user.uri,
		avatar: getAvatarUrl(user, config),
		header: getHeaderUrl(user, config),
		locked: user.isLocked,
		created_at: new Date(user.createdAt).toISOString(),
		followers_count: user.relationshipSubjects.filter(r => r.following)
			.length,
		following_count: user.relationships.filter(r => r.following).length,
		statuses_count: user._count.statuses,
		emojis: user.emojis.map(emoji => emojiToAPI(emoji)),
		// TODO: Add fields
		fields: [],
		bot: user.isBot,
		source:
			isOwnAccount && user.source
				? (user.source as APISource)
				: undefined,
		// TODO: Add static avatar and header
		avatar_static: "",
		header_static: "",
		acct:
			user.instance === null
				? user.username
				: `${user.username}@${user.instance.base_url}`,
		// TODO: Add these fields
		limited: false,
		moved: null,
		noindex: false,
		suspended: false,
		discoverable: undefined,
		mute_expires_at: undefined,
		group: false,
		pleroma: {
			is_admin: user.isAdmin,
			is_moderator: user.isAdmin,
		},
	};
};

/**
 * Should only return local users
 */
export const userToLysand = (user: UserWithRelations): LysandUser => {
	if (user.instanceId !== null) {
		throw new Error("Cannot convert remote user to Lysand format");
	}

	return {
		id: user.id,
		type: "User",
		uri: user.uri,
		bio: [
			{
				content: user.note,
				content_type: "text/html",
			},
			{
				content: htmlToText(user.note),
				content_type: "text/plain",
			},
		],
		created_at: new Date(user.createdAt).toISOString(),
		disliked: `${user.uri}/disliked`,
		featured: `${user.uri}/featured`,
		liked: `${user.uri}/liked`,
		followers: `${user.uri}/followers`,
		following: `${user.uri}/following`,
		inbox: `${user.uri}/inbox`,
		outbox: `${user.uri}/outbox`,
		indexable: false,
		username: user.username,
		avatar: [
			{
				content: getAvatarUrl(user, config) || "",
				content_type: `image/${user.avatar.split(".")[1]}`,
			},
		],
		header: [
			{
				content: getHeaderUrl(user, config) || "",
				content_type: `image/${user.header.split(".")[1]}`,
			},
		],
		display_name: user.displayName,
		fields: (user.source as any as APISource).fields.map(field => ({
			key: [
				{
					content: field.name,
					content_type: "text/html",
				},
				{
					content: htmlToText(field.name),
					content_type: "text/plain",
				},
			],
			value: [
				{
					content: field.value,
					content_type: "text/html",
				},
				{
					content: htmlToText(field.value),
					content_type: "text/plain",
				},
			],
		})),
		public_key: {
			actor: `${config.http.base_url}/users/${user.id}`,
			public_key: user.publicKey,
		},
		extensions: {
			"org.lysand:custom_emojis": {
				emojis: user.emojis.map(emoji => emojiToLysand(emoji)),
			},
		},
	};
};
