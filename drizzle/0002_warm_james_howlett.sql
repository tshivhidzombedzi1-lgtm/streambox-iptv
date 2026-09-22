CREATE TABLE `channel_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channel_reactions` (
	`channelId` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`reaction` enum('like','dislike') NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channel_reactions_channelId_userId_pk` PRIMARY KEY(`channelId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `channel_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` varchar(128) NOT NULL,
	`channelName` varchar(240) NOT NULL,
	`userId` int NOT NULL,
	`recipient` varchar(180) NOT NULL,
	`method` enum('copy','email','whatsapp','direct') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`userId` int NOT NULL,
	`plan` enum('free','plus','max') NOT NULL DEFAULT 'plus',
	`status` enum('trial','active','past_due','canceled') NOT NULL DEFAULT 'trial',
	`trialEndsAt` bigint NOT NULL,
	`currentPeriodEndsAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE INDEX `channel_comments_channel_idx` ON `channel_comments` (`channelId`);--> statement-breakpoint
CREATE INDEX `channel_reactions_channel_idx` ON `channel_reactions` (`channelId`);--> statement-breakpoint
CREATE INDEX `channel_shares_channel_idx` ON `channel_shares` (`channelId`);--> statement-breakpoint
CREATE INDEX `channel_shares_user_idx` ON `channel_shares` (`userId`);