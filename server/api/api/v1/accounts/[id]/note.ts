import { parseRequest } from "@request";
import { errorResponse, jsonResponse } from "@response";
import type { MatchedRoute } from "bun";
import {
	createNewRelationship,
	relationshipToAPI,
} from "~database/entities/Relationship";
import {
	getFromRequest,
	getRelationshipToOtherUser,
} from "~database/entities/User";
import { applyConfig } from "@api";
import { client } from "~database/datasource";

export const meta = applyConfig({
	allowedMethods: ["POST"],
	ratelimits: {
		max: 30,
		duration: 60,
	},
	route: "/accounts/:id/note",
	auth: {
		required: true,
	},
});

/**
 * Sets a user note
 */
export default async (
	req: Request,
	matchedRoute: MatchedRoute
): Promise<Response> => {
	const id = matchedRoute.params.id;

	const { user: self } = await getFromRequest(req);

	if (!self) return errorResponse("Unauthorized", 401);

	const { comment } = await parseRequest<{
		comment: string;
	}>(req);

	const user = await client.user.findUnique({
		where: { id },
		include: {
			relationships: {
				include: {
					owner: true,
					subject: true,
				},
			},
		},
	});

	if (!user) return errorResponse("User not found", 404);

	// Check if already following
	let relationship = await getRelationshipToOtherUser(self, user);

	if (!relationship) {
		// Create new relationship

		const newRelationship = await createNewRelationship(self, user);

		await client.user.update({
			where: { id: self.id },
			data: {
				relationships: {
					connect: {
						id: newRelationship.id,
					},
				},
			},
		});

		relationship = newRelationship;
	}

	relationship.note = comment ?? "";

	await client.relationship.update({
		where: { id: relationship.id },
		data: {
			note: relationship.note,
		},
	});

	return jsonResponse(relationshipToAPI(relationship));
};
