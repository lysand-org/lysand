import type { Relationship as ApiRelationship } from "@lysand-org/client/types";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "~/drizzle/db";
import { Relationships } from "~/drizzle/schema";
import type { User } from "~/packages/database-interface/user";

export type Relationship = InferSelectModel<typeof Relationships> & {
    requestedBy: boolean;
};

/**
 * Creates a new relationship between two users.
 * @param owner The user who owns the relationship.
 * @param other The user who is the subject of the relationship.
 * @returns The newly created relationship.
 */
export const createNewRelationship = async (
    owner: User,
    other: User,
): Promise<Relationship> => {
    return {
        ...(
            await db
                .insert(Relationships)
                .values({
                    ownerId: owner.id,
                    subjectId: other.id,
                    languages: [],
                    following: false,
                    showingReblogs: false,
                    notifying: false,
                    followedBy: false,
                    blocking: false,
                    blockedBy: false,
                    muting: false,
                    mutingNotifications: false,
                    requested: false,
                    domainBlocking: false,
                    endorsed: false,
                    note: "",
                    updatedAt: new Date().toISOString(),
                })
                .returning()
        )[0],
        requestedBy: false,
    };
};

export const checkForBidirectionalRelationships = async (
    user1: User,
    user2: User,
    createIfNotExists = true,
): Promise<boolean> => {
    const relationship1 = await db.query.Relationships.findFirst({
        where: (rel, { and, eq }) =>
            and(eq(rel.ownerId, user1.id), eq(rel.subjectId, user2.id)),
    });

    const relationship2 = await db.query.Relationships.findFirst({
        where: (rel, { and, eq }) =>
            and(eq(rel.ownerId, user2.id), eq(rel.subjectId, user1.id)),
    });

    if (!relationship1 && createIfNotExists) {
        await createNewRelationship(user1, user2);
    }

    if (!relationship2 && createIfNotExists) {
        await createNewRelationship(user2, user1);
    }

    return !!relationship1 && !!relationship2;
};

/**
 * Converts the relationship to an API-friendly format.
 * @returns The API-friendly relationship.
 */
export const relationshipToApi = (rel: Relationship): ApiRelationship => {
    return {
        blocked_by: rel.blockedBy,
        blocking: rel.blocking,
        domain_blocking: rel.domainBlocking,
        endorsed: rel.endorsed,
        followed_by: rel.followedBy,
        following: rel.following,
        id: rel.subjectId,
        muting: rel.muting,
        muting_notifications: rel.mutingNotifications,
        notifying: rel.notifying,
        requested: rel.requested,
        requested_by: rel.requestedBy,
        showing_reblogs: rel.showingReblogs,
        note: rel.note,
    };
};
