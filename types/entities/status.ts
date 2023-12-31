import type { APIAccount } from "./account";
import type { APIApplication } from "./application";
import type { APIAttachment } from "./attachment";
import type { APICard } from "./card";
import type { APIEmoji } from "./emoji";
import type { APIMention } from "./mention";
import type { APIPoll } from "./poll";

export interface APIStatus {
	id: string;
	uri: string;
	url: string;
	account: APIAccount;
	in_reply_to_id: string | null;
	in_reply_to_account_id: string | null;
	reblog: APIStatus | null;
	content: string;
	created_at: string;
	emojis: APIEmoji[];
	replies_count: number;
	reblogs_count: number;
	favourites_count: number;
	reblogged: boolean | null;
	favourited: boolean | null;
	muted: boolean | null;
	sensitive: boolean;
	spoiler_text: string;
	visibility: "public" | "unlisted" | "private" | "direct";
	media_attachments: APIAttachment[];
	mentions: APIMention[];
	tags: APIStatusTag[];
	card: APICard | null;
	poll: APIPoll | null;
	application: APIApplication | null;
	language: string | null;
	pinned: boolean | null;
	bookmarked?: boolean;
	// These parameters are unique parameters in fedibird.com for quote.
	quote_id?: string;
	quote?: APIStatus | null;
}

export interface APIStatusTag {
	name: string;
	url: string;
}
