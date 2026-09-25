CREATE TABLE "repo_preferences" (
	"user_id" text NOT NULL,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"model_id" text,
	"skill_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setup_command" text,
	"check_command" text,
	"instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repo_preferences_user_id_repo_owner_repo_name_pk" PRIMARY KEY("user_id","repo_owner","repo_name")
);
--> statement-breakpoint
ALTER TABLE "repo_preferences" ADD CONSTRAINT "repo_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;