CREATE TABLE `watch_room_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`fromUserId` int NOT NULL,
	`toUserId` int NOT NULL,
	`kind` enum('hello','offer','answer','ice') NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watch_room_signals_id` PRIMARY KEY(`id`)
);
