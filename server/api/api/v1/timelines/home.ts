/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { applyConfig } from "@api";
import { parseRequest } from "@request";
import { errorResponse, jsonResponse } from "@response";
import { client } from "~database/datasource";
import { statusAndUserRelations, statusToAPI } from "~database/entities/Status";
import { getFromRequest } from "~database/entities/User";
import type { APIRouteMeta } from "~types/api";

export const meta: APIRouteMeta = applyConfig({
	allowedMethods: ["GET"],
	ratelimits: {
		max: 200,
		duration: 60,
	},
	route: "/api/v1/timelines/home",
	auth: {
		required: true,
	},
});

/**
 * Fetch home timeline statuses
 */
export default async (req: Request): Promise<Response> => {
	const { user } = await getFromRequest(req);

	const {
		limit = 20,
		max_id,
		min_id,
		since_id,
	} = await parseRequest<{
		max_id?: string;
		since_id?: string;
		min_id?: string;
		limit?: number;
	}>(req);

	if (limit < 1 || limit > 40) {
		return errorResponse("Limit must be between 1 and 40", 400);
	}

	if (!user) return errorResponse("Unauthorized", 401);

	const objects = await client.status.findMany({
		where: {
			id: {
				lt: max_id ?? undefined,
				gte: since_id ?? undefined,
				gt: min_id ?? undefined,
			},
			OR: [
				{
					author: {
						OR: [
							{
								relationshipSubjects: {
									some: {
										ownerId: user.id,
										following: true,
									},
								},
							},
							{
								id: user.id,
							},
						],
					},
				},
				{
					// Include posts where the user is mentioned in addition to posts by followed users
					mentions: {
						some: {
							id: user.id,
						},
					},
				},
			],
		},
		include: statusAndUserRelations,
		take: limit,
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
		await Promise.all(
			objects.map(async status => statusToAPI(status, user))
		),
		200,
		{
			Link: linkHeader.join(", "),
		}
	);
};
