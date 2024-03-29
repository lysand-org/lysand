import { apiRoute, applyConfig } from "@api";
import { MeiliIndexType, meilisearch } from "@meilisearch";
import { errorResponse, jsonResponse } from "@response";
import { client } from "~database/datasource";
import { statusToAPI } from "~database/entities/Status";
import { userToAPI } from "~database/entities/User";
import {
	statusAndUserRelations,
	userRelations,
} from "~database/entities/relations";

export const meta = applyConfig({
	allowedMethods: ["GET"],
	ratelimits: {
		max: 10,
		duration: 60,
	},
	route: "/api/v2/search",
	auth: {
		required: false,
		oauthPermissions: ["read:search"],
	},
});

/**
 * Upload new media
 */
export default apiRoute<{
	q?: string;
	type?: string;
	resolve?: boolean;
	following?: boolean;
	account_id?: string;
	max_id?: string;
	min_id?: string;
	limit?: number;
	offset?: number;
}>(async (req, matchedRoute, extraData) => {
	const { user } = extraData.auth;

	const {
		q,
		type,
		resolve,
		following,
		account_id,
		// max_id,
		// min_id,
		limit = 20,
		offset,
	} = extraData.parsedRequest;

	const config = await extraData.configManager.getConfig();

	if (!config.meilisearch.enabled) {
		return errorResponse("Meilisearch is not enabled", 501);
	}

	if (!user && (resolve || offset)) {
		return errorResponse(
			"Cannot use resolve or offset without being authenticated",
			401
		);
	}

	if (limit < 1 || limit > 40) {
		return errorResponse("Limit must be between 1 and 40", 400);
	}

	let accountResults: { id: string }[] = [];
	let statusResults: { id: string }[] = [];

	if (!type || type === "accounts") {
		accountResults = (
			await meilisearch.index(MeiliIndexType.Accounts).search<{
				id: string;
			}>(q, {
				limit: Number(limit) || 10,
				offset: Number(offset) || 0,
				sort: ["createdAt:desc"],
			})
		).hits;
	}

	if (!type || type === "statuses") {
		statusResults = (
			await meilisearch.index(MeiliIndexType.Statuses).search<{
				id: string;
			}>(q, {
				limit: Number(limit) || 10,
				offset: Number(offset) || 0,
				sort: ["createdAt:desc"],
			})
		).hits;
	}

	const accounts = await client.user.findMany({
		where: {
			id: {
				in: accountResults.map(hit => hit.id),
			},
			relationshipSubjects: {
				some: {
					subjectId: user?.id,
					following: following ? true : undefined,
				},
			},
		},
		orderBy: {
			createdAt: "desc",
		},
		include: userRelations,
	});

	const statuses = await client.status.findMany({
		where: {
			id: {
				in: statusResults.map(hit => hit.id),
			},
			author: {
				relationshipSubjects: {
					some: {
						subjectId: user?.id,
						following: following ? true : undefined,
					},
				},
			},
			authorId: account_id ? account_id : undefined,
		},
		orderBy: {
			createdAt: "desc",
		},
		include: statusAndUserRelations,
	});

	return jsonResponse({
		accounts: accounts.map(account => userToAPI(account)),
		statuses: await Promise.all(
			statuses.map(status => statusToAPI(status))
		),
		hashtags: [],
	});
});
