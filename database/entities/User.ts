import { getConfig, getHost } from "@config";
import {
	BaseEntity,
	Column,
	CreateDateColumn,
	Entity,
	JoinTable,
	ManyToMany,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";
import { APIAccount } from "~types/entities/account";
import { RawActor } from "./RawActor";
import { APActor } from "activitypub-types";

const config = getConfig();

/**
 * Stores local and remote users
 */
@Entity({
	name: "users",
})
export class User extends BaseEntity {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column("varchar", {
		unique: true,
	})
	username!: string;

	@Column("varchar", {
		unique: true,
	})
	display_name!: string;

	@Column("varchar")
	password!: string;

	@Column("varchar", {
		unique: true,
	})
	email!: string;

	@Column("varchar", {
		default: "",
	})
	note!: string;

	@Column("boolean", {
		default: false,
	})
	is_admin!: boolean;

	@Column("varchar")
	avatar!: string;

	@Column("varchar")
	header!: string;

	@CreateDateColumn()
	created_at!: Date;

	@UpdateDateColumn()
	updated_at!: Date;

	@Column("varchar")
	public_key!: string;

	@Column("varchar")
	private_key!: string;

	@ManyToOne(() => RawActor, actor => actor.id)
	actor!: RawActor;

	@ManyToMany(() => RawActor, actor => actor.id)
	@JoinTable()
	following!: RawActor[];

	static async getByActorId(id: string) {
		return await User.createQueryBuilder("user")
			// Objects is a many-to-many relationship
			.leftJoinAndSelect("user.actor", "actor")
			.leftJoinAndSelect("user.following", "following")
			.where("actor.data @> :data", {
				data: JSON.stringify({
					id,
				}),
			})
			.getOne();
	}

	static async createNew(data: {
		username: string;
		display_name?: string;
		password: string;
		email: string;
		bio?: string;
		avatar?: string;
		header?: string;
	}) {
		const config = getConfig();
		const user = new User();

		user.username = data.username;
		user.display_name = data.display_name ?? data.username;
		user.password = await Bun.password.hash(data.password);
		user.email = data.email;
		user.note = data.bio ?? "";
		user.avatar = data.avatar ?? config.defaults.avatar;
		user.header = data.header ?? config.defaults.avatar;

		await user.generateKeys();
		await user.updateActor();

		await user.save();
		return user;
	}

	async updateActor() {
		// Check if actor exists
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const actor = this.actor ? this.actor : new RawActor();

		actor.data = {
			"@context": [
				"https://www.w3.org/ns/activitystreams",
				"https://w3id.org/security/v1",
			],
			id: `${config.http.base_url}/@${this.username}`,
			type: "Person",
			preferredUsername: this.username,
			name: this.display_name,
			inbox: `${config.http.base_url}/@${this.username}/inbox`,
			outbox: `${config.http.base_url}/@${this.username}/outbox`,
			followers: `${config.http.base_url}/@${this.username}/followers`,
			following: `${config.http.base_url}/@${this.username}/following`,
			manuallyApprovesFollowers: false,
			summary: this.note,
			icon: {
				type: "Image",
				url: this.avatar,
			},
			image: {
				type: "Image",
				url: this.header,
			},
			publicKey: {
				id: `${config.http.base_url}/@${this.username}/actor#main-key`,
				owner: `${config.http.base_url}/@${this.username}/actor`,
				publicKeyPem: this.public_key,
			},
		} as APActor;

		await actor.save();

		this.actor = actor;
		await this.save();
		return actor;
	}

	async generateKeys(): Promise<void> {
		// openssl genrsa -out private.pem 2048
		// openssl rsa -in private.pem -outform PEM -pubout -out public.pem

		const keys = await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				hash: "SHA-256",
				modulusLength: 4096,
				publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
			},
			true,
			["sign", "verify"]
		);

		const privateKey = btoa(
			String.fromCharCode.apply(null, [
				...new Uint8Array(
					await crypto.subtle.exportKey("pkcs8", keys.privateKey)
				),
			])
		);
		const publicKey = btoa(
			String.fromCharCode(
				...new Uint8Array(
					await crypto.subtle.exportKey("spki", keys.publicKey)
				)
			)
		);

		// Add header, footer and newlines later on
		// These keys are PEM encrypted
		this.private_key = privateKey;
		this.public_key = publicKey;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async toAPI(): Promise<APIAccount> {
		return {
			acct: `@${this.username}@${getHost()}`,
			avatar: "",
			avatar_static: "",
			bot: false,
			created_at: this.created_at.toISOString(),
			display_name: "",
			followers_count: 0,
			following_count: 0,
			group: false,
			header: "",
			header_static: "",
			id: this.id,
			locked: false,
			moved: null,
			noindex: false,
			note: this.note,
			suspended: false,
			url: `${config.http.base_url}/@${this.username}`,
			username: this.username,
			emojis: [],
			fields: [],
			limited: false,
			source: undefined,
			statuses_count: 0,
			discoverable: undefined,
			role: undefined,
			mute_expires_at: undefined,
		};
	}
}
