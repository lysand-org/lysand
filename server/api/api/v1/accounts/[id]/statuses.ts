/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { errorResponse, jsonResponse } from "@response";
import type { MatchedRoute } from "bun";
import { statusAndUserRelations, statusToAPI } from "~database/entities/Status";
import { userRelations } from "~database/entities/User";
import { applyConfig } from "@api";
import { client } from "~database/datasource";

export const meta = applyConfig({
	allowedMethods: ["GET"],
	ratelimits: {
		max: 30,
		duration: 60,
	},
	route: "/accounts/:id/statuses",
	auth: {
		required: false,
	},
});

/**
 * Fetch all statuses for a user
 */
export default async (
	req: Request,
	matchedRoute: MatchedRoute
): Promise<Response> => {
	const id = matchedRoute.params.id;

	// TODO: Add pinned
	const {
		max_id,
		min_id,
		since_id,
		limit = "20",
		exclude_reblogs,
		pinned,
	}: {
		max_id?: string;
		since_id?: string;
		min_id?: string;
		limit?: string;
		only_media?: boolean;
		exclude_replies?: boolean;
		exclude_reblogs?: boolean;
		// TODO: Add with_muted
		pinned?: boolean;
		tagged?: string;
	} = matchedRoute.query;

	const user = await client.user.findUnique({
		where: { id },
		include: userRelations,
	});

	if (!user) return errorResponse("User not found", 404);

	if (pinned) {
		const objects = await client.status.findMany({
			where: {
				authorId: id,
				isReblog: false,
				pinnedBy: {
					some: {
						id: user.id,
					},
				},
				id: {
					lt: max_id,
					gt: min_id,
					gte: since_id,
				},
			},
			include: statusAndUserRelations,
			take: Number(limit),
			orderBy: {
				id: "desc",
			},
		});

		// Constuct HTTP Link header (next and prev)
		const linkHeader = [];
		if (objects.length > 0) {
			const urlWithoutQuery = req.url.split("?")[0];
			linkHeader.push(
				`<${urlWithoutQuery}?max_id=${objects.at(-1)?.id}>; rel="next"`,
				`<${urlWithoutQuery}?min_id=${objects[0].id}>; rel="prev"`
			);
		}

		return jsonResponse(
			await Promise.all(objects.map(status => statusToAPI(status, user))),
			200,
			{
				Link: linkHeader.join(", "),
			}
		);
	}

	const objects = await client.status.findMany({
		where: {
			authorId: id,
			isReblog: exclude_reblogs ? true : undefined,
			id: {
				lt: max_id,
				gt: min_id,
				gte: since_id,
			},
		},
		include: statusAndUserRelations,
		take: Number(limit),
		orderBy: {
			id: "desc",
		},
	});

	// Constuct HTTP Link header (next and prev)
	const linkHeader = [];
	if (objects.length > 0) {
		const urlWithoutQuery = req.url.split("?")[0];
		linkHeader.push(
			`<${urlWithoutQuery}?max_id=${objects.at(-1)?.id}>; rel="next"`,
			`<${urlWithoutQuery}?min_id=${objects[0].id}>; rel="prev"`
		);
	}

	return jsonResponse(
		await Promise.all(objects.map(status => statusToAPI(status, user))),
		200,
		{
			Link: linkHeader.join(", "),
		}
	);
};
