import { errorResponse, jsonResponse } from "@response";
import { getFromRequest, userRelations } from "~database/entities/User";
import { applyConfig } from "@api";
import { client } from "~database/datasource";
import { statusAndUserRelations } from "~database/entities/Status";
import { parseRequest } from "@request";
import { notificationToAPI } from "~database/entities/Notification";

export const meta = applyConfig({
	allowedMethods: ["GET"],
	route: "/api/v1/notifications",
	ratelimits: {
		max: 100,
		duration: 60,
	},
	auth: {
		required: true,
	},
});

export default async (req: Request): Promise<Response> => {
	const { user } = await getFromRequest(req);

	if (!user) return errorResponse("Unauthorized", 401);

	const {
		account_id,
		exclude_types,
		limit = 15,
		max_id,
		min_id,
		since_id,
		types,
	} = await parseRequest<{
		max_id?: string;
		since_id?: string;
		min_id?: string;
		limit?: number;
		exclude_types?: string[];
		types?: string[];
		account_id?: string;
	}>(req);

	if (limit > 30) return errorResponse("Limit too high", 400);

	if (limit <= 0) return errorResponse("Limit too low", 400);

	if (types && exclude_types) {
		return errorResponse("Can't use both types and exclude_types", 400);
	}

	const objects = await client.notification.findMany({
		where: {
			notifiedId: user.id,
			id: {
				lt: max_id,
				gt: min_id,
				gte: since_id,
			},
			type: {
				in: types,
				notIn: exclude_types,
			},
			accountId: account_id,
		},
		include: {
			account: {
				include: userRelations,
			},
			status: {
				include: statusAndUserRelations,
			},
		},
		orderBy: {
			id: "desc",
		},
		take: limit,
	});

	// Constuct HTTP Link header (next and prev)
	const linkHeader = [];
	if (objects.length > 0) {
		const urlWithoutQuery = req.url.split("?")[0];
		linkHeader.push(
			`<${urlWithoutQuery}?max_id=${objects[0].id}&limit=${limit}>; rel="next"`
		);
		linkHeader.push(
			`<${urlWithoutQuery}?since_id=${objects.at(-1)
				?.id}&limit=${limit}>; rel="prev"`
		);
	}

	return jsonResponse(
		await Promise.all(objects.map(n => notificationToAPI(n))),
		200,
		{
			Link: linkHeader.join(", "),
		}
	);
};
