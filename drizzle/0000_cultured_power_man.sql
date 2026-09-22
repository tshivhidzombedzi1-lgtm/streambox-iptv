CREATE TABLE `watch_room_members` (
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('host','co-host','member') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watch_room_members_roomId_userId_pk` PRIMARY KEY(`roomId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `watch_room_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watch_room_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watch_room_playback` (
	`roomId` int NOT NULL,
	`channelId` varchar(320) NOT NULL,
	`channelName` varchar(240) NOT NULL,
	`streamUrl` text NOT NULL,
	`isPlaying` int NOT NULL DEFAULT 0,
	`positionMs` int NOT NULL DEFAULT 0,
	`updatedBy` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watch_room_playback_roomId` PRIMARY KEY(`roomId`)
);
--> statement-breakpoint
CREATE TABLE `watch_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(12) NOT NULL,
	`name` varchar(120) NOT NULL,
	`hostUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watch_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `watch_rooms_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
