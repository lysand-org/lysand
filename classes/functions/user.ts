import { getLogger } from "@logtape/logtape";
import type {
    Follow,
    FollowAccept,
    FollowReject,
} from "@lysand-org/federation/types";
import { config } from "config-manager";
import { type InferSelectModel, and, eq, sql } from "drizzle-orm";
import { db } from "~/drizzle/db";
import {
    Applications,
    type Instances,
    Notifications,
    Relationships,
    type Roles,
    Tokens,
    type Users,
} from "~/drizzle/schema";
import { User } from "~/packages/database-interface/user";
import type { Application } from "./application";
import type { EmojiWithInstance } from "./emoji";
import { objectToInboxRequest } from "./federation";
import {
    type Relationship,
    checkForBidirectionalRelationships,
    createNewRelationship,
} from "./relationship";
import type { Token } from "./token";

export type UserType = InferSelectModel<typeof Users>;

export type UserWithInstance = UserType & {
    instance: InferSelectModel<typeof Instances> | null;
};

export type UserWithRelations = UserType & {
    instance: InferSelectModel<typeof Instances> | null;
    emojis: EmojiWithInstance[];
    followerCount: number;
    followingCount: number;
    statusCount: number;
    roles: InferSelectModel<typeof Roles>[];
};

export const userRelations: {
    instance: true;
    emojis: {
        with: {
            emoji: {
                with: {
                    instance: true;
                };
            };
        };
    };
    roles: {
        with: {
            role: true;
        };
    };
} = {
    instance: true,
    emojis: {
        with: {
            emoji: {
                with: {
                    instance: true,
                },
            },
        },
    },
    roles: {
        with: {
            role: true,
        },
    },
};

export const userExtras = {
    followerCount:
        sql`(SELECT COUNT(*) FROM "Relationships" "relationships" WHERE ("relationships"."ownerId" = "Users".id AND "relationships"."following" = true))`.as(
            "follower_count",
        ),
    followingCount:
        sql`(SELECT COUNT(*) FROM "Relationships" "relationshipSubjects" WHERE ("relationshipSubjects"."subjectId" = "Users".id AND "relationshipSubjects"."following" = true))`.as(
            "following_count",
        ),
    statusCount:
        sql`(SELECT COUNT(*) FROM "Notes" WHERE "Notes"."authorId" = "Users".id)`.as(
            "status_count",
        ),
};

export const userExtrasTemplate = (name: string) => ({
    // @ts-ignore
    followerCount: sql([
        `(SELECT COUNT(*) FROM "Relationships" "relationships" WHERE ("relationships"."ownerId" = "${name}".id AND "relationships"."following" = true))`,
    ]).as("follower_count"),
    // @ts-ignore
    followingCount: sql([
        `(SELECT COUNT(*) FROM "Relationships" "relationshipSubjects" WHERE ("relationshipSubjects"."subjectId" = "${name}".id AND "relationshipSubjects"."following" = true))`,
    ]).as("following_count"),
    // @ts-ignore
    statusCount: sql([
        `(SELECT COUNT(*) FROM "Notes" WHERE "Notes"."authorId" = "${name}".id)`,
    ]).as("status_count"),
});

export interface AuthData {
    user: User | null;
    token: string;
    application: Application | null;
}

export const getFromHeader = async (value: string): Promise<AuthData> => {
    const token = value.split(" ")[1];

    const { user, application } =
        await retrieveUserAndApplicationFromToken(token);

    return { user, token, application };
};

export const followRequestUser = async (
    follower: User,
    followee: User,
    relationshipId: string,
    reblogs = false,
    notify = false,
    languages: string[] = [],
): Promise<Relationship> => {
    const isRemote = followee.isRemote();

    await db
        .update(Relationships)
        .set({
            following: isRemote ? false : !followee.data.isLocked,
            requested: isRemote ? true : followee.data.isLocked,
            showingReblogs: reblogs,
            notifying: notify,
            languages: languages,
        })
        .where(eq(Relationships.id, relationshipId));

    // Set requested_by on other side
    await db
        .update(Relationships)
        .set({
            requestedBy: isRemote ? true : followee.data.isLocked,
            followedBy: isRemote ? false : followee.data.isLocked,
        })
        .where(
            and(
                eq(Relationships.ownerId, followee.id),
                eq(Relationships.subjectId, follower.id),
            ),
        );

    const updatedRelationship = await db.query.Relationships.findFirst({
        where: (rel, { eq }) => eq(rel.id, relationshipId),
    });

    if (!updatedRelationship) {
        throw new Error("Failed to update relationship");
    }

    if (isRemote) {
        // Federate
        // TODO: Make database job
        const request = await objectToInboxRequest(
            followRequestToLysand(follower, followee),
            follower,
            followee,
        );

        // Send request
        const response = await fetch(request, {
            proxy: config.http.proxy.address,
        });

        if (!response.ok) {
            const logger = getLogger("federation");

            logger.debug`${await response.text()}`;
            logger.error`Failed to federate follow request from ${follower.id} to ${followee.getUri()}`;

            await db
                .update(Relationships)
                .set({
                    following: false,
                    requested: false,
                })
                .where(eq(Relationships.id, relationshipId));

            const result = await db.query.Relationships.findFirst({
                where: (rel, { eq }) => eq(rel.id, relationshipId),
            });

            if (!result) {
                throw new Error("Failed to update relationship");
            }

            return result;
        }
    } else {
        await db.insert(Notifications).values({
            accountId: follower.id,
            type: followee.data.isLocked ? "follow_request" : "follow",
            notifiedId: followee.id,
        });
    }

    return updatedRelationship;
};

export const sendFollowAccept = async (follower: User, followee: User) => {
    // TODO: Make database job
    const request = await objectToInboxRequest(
        followAcceptToLysand(follower, followee),
        followee,
        follower,
    );

    // Send request
    const response = await fetch(request, {
        proxy: config.http.proxy.address,
    });

    if (!response.ok) {
        const logger = getLogger("federation");

        logger.debug`${await response.text()}`;
        logger.error`Failed to federate follow accept from ${followee.id} to ${follower.getUri()}`;
    }
};

export const sendFollowReject = async (follower: User, followee: User) => {
    // TODO: Make database job
    const request = await objectToInboxRequest(
        followRejectToLysand(follower, followee),
        followee,
        follower,
    );

    // Send request
    const response = await fetch(request, {
        proxy: config.http.proxy.address,
    });

    if (!response.ok) {
        const logger = getLogger("federation");

        logger.debug`${await response.text()}`;
        logger.error`Failed to federate follow reject from ${followee.id} to ${follower.getUri()}`;
    }
};

export const transformOutputToUserWithRelations = (
    user: Omit<UserType, "endpoints"> & {
        followerCount: unknown;
        followingCount: unknown;
        statusCount: unknown;
        emojis: {
            userId: string;
            emojiId: string;
            emoji?: EmojiWithInstance;
        }[];
        instance: InferSelectModel<typeof Instances> | null;
        roles: {
            userId: string;
            roleId: string;
            role?: InferSelectModel<typeof Roles>;
        }[];
        endpoints: unknown;
    },
): UserWithRelations => {
    return {
        ...user,
        followerCount: Number(user.followerCount),
        followingCount: Number(user.followingCount),
        statusCount: Number(user.statusCount),
        endpoints:
            user.endpoints ??
            ({} as Partial<{
                dislikes: string;
                featured: string;
                likes: string;
                followers: string;
                following: string;
                inbox: string;
                outbox: string;
            }>),
        emojis: user.emojis.map(
            (emoji) =>
                (emoji as unknown as Record<string, object>)
                    .emoji as EmojiWithInstance,
        ),
        roles: user.roles
            .map((role) => role.role)
            .filter(Boolean) as InferSelectModel<typeof Roles>[],
    };
};

export const findManyUsers = async (
    query: Parameters<typeof db.query.Users.findMany>[0],
): Promise<UserWithRelations[]> => {
    const output = await db.query.Users.findMany({
        ...query,
        with: {
            ...userRelations,
            ...query?.with,
        },
        extras: {
            ...userExtras,
            ...query?.extras,
        },
    });

    return output.map((user) => transformOutputToUserWithRelations(user));
};

/**
 * Retrieves a user from a token.
 * @param access_token The access token to retrieve the user from.
 * @returns The user associated with the given access token.
 */
export const retrieveUserFromToken = async (
    accessToken: string,
): Promise<User | null> => {
    if (!accessToken) {
        return null;
    }

    const token = await retrieveToken(accessToken);

    if (!token?.userId) {
        return null;
    }

    const user = await User.fromId(token.userId);

    return user;
};

export const retrieveUserAndApplicationFromToken = async (
    accessToken: string,
): Promise<{
    user: User | null;
    application: Application | null;
}> => {
    if (!accessToken) {
        return { user: null, application: null };
    }

    const output = (
        await db
            .select({
                token: Tokens,
                application: Applications,
            })
            .from(Tokens)
            .leftJoin(Applications, eq(Tokens.applicationId, Applications.id))
            .where(eq(Tokens.accessToken, accessToken))
            .limit(1)
    )[0];

    if (!output?.token.userId) {
        return { user: null, application: null };
    }

    const user = await User.fromId(output.token.userId);

    return { user, application: output.application ?? null };
};

export const retrieveToken = async (
    accessToken: string,
): Promise<Token | null> => {
    if (!accessToken) {
        return null;
    }

    return (
        (await db.query.Tokens.findFirst({
            where: (tokens, { eq }) => eq(tokens.accessToken, accessToken),
        })) ?? null
    );
};

/**
 * Gets the relationship to another user.
 * @param other The other user to get the relationship to.
 * @returns The relationship to the other user.
 */
export const getRelationshipToOtherUser = async (
    user: User,
    other: User,
): Promise<Relationship> => {
    await checkForBidirectionalRelationships(user, other);

    const foundRelationship = await db.query.Relationships.findFirst({
        where: (relationship, { and, eq }) =>
            and(
                eq(relationship.ownerId, user.id),
                eq(relationship.subjectId, other.id),
            ),
    });

    if (!foundRelationship) {
        // Create new relationship

        const newRelationship = await createNewRelationship(user, other);

        return newRelationship;
    }

    return foundRelationship;
};

export const followRequestToLysand = (
    follower: User,
    followee: User,
): Follow => {
    if (follower.isRemote()) {
        throw new Error("Follower must be a local user");
    }

    if (!followee.isRemote()) {
        throw new Error("Followee must be a remote user");
    }

    if (!followee.data.uri) {
        throw new Error("Followee must have a URI in database");
    }

    const id = crypto.randomUUID();

    return {
        type: "Follow",
        id: id,
        author: follower.getUri(),
        followee: followee.getUri(),
        created_at: new Date().toISOString(),
        uri: new URL(`/follows/${id}`, config.http.base_url).toString(),
    };
};

export const followAcceptToLysand = (
    follower: User,
    followee: User,
): FollowAccept => {
    if (!follower.isRemote()) {
        throw new Error("Follower must be a remote user");
    }

    if (followee.isRemote()) {
        throw new Error("Followee must be a local user");
    }

    if (!follower.data.uri) {
        throw new Error("Follower must have a URI in database");
    }

    const id = crypto.randomUUID();

    return {
        type: "FollowAccept",
        id: id,
        author: followee.getUri(),
        created_at: new Date().toISOString(),
        follower: follower.getUri(),
        uri: new URL(`/follows/${id}`, config.http.base_url).toString(),
    };
};

export const followRejectToLysand = (
    follower: User,
    followee: User,
): FollowReject => {
    return {
        ...followAcceptToLysand(follower, followee),
        type: "FollowReject",
    };
};
