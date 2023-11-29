import type { Prisma } from "@prisma/client";
import chalk from "chalk";
import { client } from "~database/datasource";
import { createNewLocalUser } from "~database/entities/User";
import Table from "cli-table";

const args = process.argv;

/**
 * Make the text have a width of 20 characters, padding with gray dots
 * Text can be a Chalk string, in which case formatting codes should not be counted in text length
 * @param text The text to align
 */
const alignDots = (text: string, length = 20) => {
	// Remove formatting codes
	// eslint-disable-next-line no-control-regex
	const textLength = text.replace(/\u001b\[\d+m/g, "").length;
	const dots = ".".repeat(length - textLength);
	return `${text}${chalk.gray(dots)}`;
};

const alignDotsSmall = (text: string, length = 16) => alignDots(text, length);

const help = `
${chalk.bold(`Usage: bun cli <command> ${chalk.blue("[...flags]")} [...args]`)}

${chalk.bold("Commands:")}
    ${alignDots(chalk.blue("help"), 24)} Show this help message
    ${alignDots(chalk.blue("user"), 24)} Manage users
        ${alignDots(chalk.blue("create"))} Create a new user
            ${alignDotsSmall(chalk.green("username"))} Username of the user
            ${alignDotsSmall(chalk.green("password"))} Password of the user
            ${alignDotsSmall(chalk.green("email"))} Email of the user
            ${alignDotsSmall(
				chalk.yellow("--admin")
			)} Make the user an admin (optional)
            ${chalk.bold("Example:")} ${chalk.bgGray(
				`bun cli user create admin password123 admin@gmail.com --admin`
			)}
        ${alignDots(chalk.blue("delete"))} Delete a user
            ${alignDotsSmall(chalk.green("username"))} Username of the user
            ${chalk.bold("Example:")} ${chalk.bgGray(
				`bun cli user delete admin`
			)}
        ${alignDots(chalk.blue("list"))} List all users
            ${alignDotsSmall(
				chalk.yellow("--admins")
			)} List only admins (optional)
            ${chalk.bold("Example:")} ${chalk.bgGray(`bun cli user list`)}
        ${alignDots(chalk.blue("search"))} Search for a user
            ${alignDotsSmall(chalk.green("query"))} Query to search for
            ${alignDotsSmall(
				chalk.yellow("--displayname")
			)} Search by display name (optional)
            ${alignDotsSmall(chalk.yellow("--bio"))} Search in bio (optional)
            ${alignDotsSmall(
				chalk.yellow("--local")
			)} Search in local users (optional)
            ${alignDotsSmall(
				chalk.yellow("--remote")
			)} Search in remote users (optional)
            ${alignDotsSmall(
				chalk.yellow("--email")
			)} Search in emails (optional)
            ${chalk.bold("Example:")} ${chalk.bgGray(
				`bun cli user search admin`
			)}
`;

if (args.length < 3) {
	console.log(help);
	process.exit(0);
}

const command = args[2];

switch (command) {
	case "help":
		console.log(help);
		break;
	case "user":
		switch (args[3]) {
			case "create": {
				// Check if --admin flag is provided
				const argsWithFlags = args.filter(arg => arg.startsWith("--"));
				const argsWithoutFlags = args.filter(
					arg => !arg.startsWith("--")
				);

				const username = argsWithoutFlags[4];
				const password = argsWithoutFlags[5];
				const email = argsWithoutFlags[6];

				const admin = argsWithFlags.includes("--admin");

				// Check if username, password and email are provided
				if (!username || !password || !email) {
					console.log(
						`${chalk.red(`✗`)} Missing username, password or email`
					);
					process.exit(1);
				}

				// Check if user already exists
				const user = await client.user.findFirst({
					where: {
						OR: [{ username }, { email }],
					},
				});

				if (user) {
					console.log(`${chalk.red(`✗`)} User already exists`);
					process.exit(1);
				}

				// Create user
				const newUser = await createNewLocalUser({
					email: email,
					password: password,
					username: username,
					admin: admin,
				});

				console.log(
					`${chalk.green(`✓`)} Created user ${chalk.blue(
						newUser.username
					)}${admin ? chalk.green(" (admin)") : ""}`
				);
				break;
			}
			case "delete": {
				const username = args[4];

				if (!username) {
					console.log(`${chalk.red(`✗`)} Missing username`);
					process.exit(1);
				}

				const user = await client.user.findFirst({
					where: {
						username: username,
					},
				});

				if (!user) {
					console.log(`${chalk.red(`✗`)} User not found`);
					process.exit(1);
				}

				await client.user.delete({
					where: {
						id: user.id,
					},
				});

				console.log(
					`${chalk.green(`✓`)} Deleted user ${chalk.blue(
						user.username
					)}`
				);

				break;
			}
			case "list": {
				const admins = args.includes("--admins");

				const users = await client.user.findMany({
					where: {
						isAdmin: admins || undefined,
					},
				});

				console.log(
					`${chalk.green(`✓`)} Found ${chalk.blue(
						users.length
					)} users`
				);

				for (const user of users) {
					console.log(
						`\t${chalk.blue(user.username)} ${chalk.gray(
							user.email
						)} ${chalk.green(user.isAdmin ? "Admin" : "User")}`
					);
				}
				break;
			}
			case "search": {
				const argsWithoutFlags = args.filter(
					arg => !arg.startsWith("--")
				);
				const query = argsWithoutFlags[4];

				if (!query) {
					console.log(`${chalk.red(`✗`)} Missing query`);
					process.exit(1);
				}

				const displayname = args.includes("--displayname");
				const bio = args.includes("--bio");
				const local = args.includes("--local");
				const remote = args.includes("--remote");
				const email = args.includes("--email");

				const queries: Prisma.UserWhereInput[] = [];

				if (displayname) {
					queries.push({
						displayName: {
							contains: query,
							mode: "insensitive",
						},
					});
				}

				if (bio) {
					queries.push({
						note: {
							contains: query,
							mode: "insensitive",
						},
					});
				}

				if (local) {
					queries.push({
						instanceId: null,
					});
				}

				if (remote) {
					queries.push({
						instanceId: {
							not: null,
						},
					});
				}

				if (email) {
					queries.push({
						email: {
							contains: query,
							mode: "insensitive",
						},
					});
				}

				const users = await client.user.findMany({
					where: {
						AND: queries,
					},
					include: {
						instance: true,
					},
				});

				console.log(
					`${chalk.green(`✓`)} Found ${chalk.blue(
						users.length
					)} users`
				);

				const table = new Table({
					head: [
						chalk.white(chalk.bold("Username")),
						chalk.white(chalk.bold("Email")),
						chalk.white(chalk.bold("Display Name")),
						chalk.white(chalk.bold("Admin?")),
						chalk.white(chalk.bold("Instance URL")),
					],
				});

				for (const user of users) {
					table.push([
						chalk.yellow(`@${user.username}`),
						chalk.green(user.email),
						chalk.blue(user.displayName),
						chalk.red(user.isAdmin ? "Yes" : "No"),
						chalk.blue(
							user.instanceId ? user.instance?.base_url : "Local"
						),
					]);
				}

				console.log(table.toString());

				break;
			}
			default:
				console.log(`Unknown command ${chalk.blue(command)}`);
				break;
		}
		break;
	default:
		console.log(`Unknown command ${chalk.blue(command)}`);
		break;
}
