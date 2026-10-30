CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    email_change VARCHAR(255),
    profile_image_url VARCHAR(64),
    profile_icon_url VARCHAR(64),
    bodyweight NUMERIC(4,1),
    scheme_color VARCHAR(7),
    created_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    last_login TIMESTAMPTZ,
    failed_login_attempts INTEGER,
    pw_hash VARCHAR(255),
    pw_reset_token VARCHAR(255),
    pw_reset_expire TIMESTAMPTZ,
    oauth_provider VARCHAR(20),
    oauth_id VARCHAR(255),
    updated_username_at TIMESTAMPTZ,
    updated_image_at TIMESTAMPTZ,
    updated_bodyweight_at TIMESTAMPTZ,
    updated_pw_at TIMESTAMPTZ,
    uses_ios BOOLEAN NOT NULL,
    uses_web BOOLEAN NOT NULL,
    weight_unit INTEGER NOT NULL,
    distance_unit INTEGER NOT NULL,
    language VARCHAR(2),
    active BOOLEAN NOT NULL,
    email_verify_token VARCHAR(255),
    email_verify_expire TIMESTAMPTZ
);

CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE musclegroup (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE muscle (
    id SERIAL PRIMARY KEY,
    name VARCHAR(25) UNIQUE NOT NULL,
    image_url VARCHAR(64) NOT NULL
);

CREATE TABLE friend (
    user_id_1 INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    user_id_2 INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    since TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id_1, user_id_2)
);

CREATE TABLE friend_request (
    sender_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "timestamp" TIMESTAMPTZ NOT NULL,
    accepted BOOLEAN,
    PRIMARY KEY (sender_id, receiver_id)
);

CREATE TABLE blocked_users (
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    since TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE exercise (
    id SERIAL PRIMARY KEY,
    -- Set by the client on creation, so that a create that is sent again (e.g. after a lost response) returns the existing row
    client_uuid UUID,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    -- Other names of the exercise (e.g. "Military Press" for "Barbell Shoulder Press"), only used by the search of the clients
    aliases VARCHAR(50)[] NOT NULL DEFAULT '{}',
    -- Hashes of the instructional images in the order they are shown, e.g. one per keyframe of the movement
    image_urls VARCHAR(64)[] NOT NULL DEFAULT '{}',
    muscle_group_id INTEGER NOT NULL REFERENCES musclegroup(id),
    equipment_id INTEGER NOT NULL REFERENCES equipment(id),
    verified BOOLEAN NOT NULL,
    user_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    reps BOOLEAN NOT NULL,
    weights BOOLEAN NOT NULL,
    "time" BOOLEAN NOT NULL,
    intensity BOOLEAN NOT NULL,
    distance BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT exercise_aliases_no_null_check CHECK (array_position(aliases, NULL) IS NULL),
    CONSTRAINT exercise_image_urls_no_null_check CHECK (array_position(image_urls, NULL) IS NULL),
    CONSTRAINT exercise_client_uuid_key UNIQUE (user_id, client_uuid)
);

CREATE TABLE exercise_muscles (
    exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
    muscle_id INTEGER NOT NULL REFERENCES muscle(id),
    is_primary BOOLEAN NOT NULL,
    PRIMARY KEY (exercise_id, muscle_id)
);

CREATE TABLE workout (
    id SERIAL PRIMARY KEY,
    -- Set by the client on creation, so that a create that is sent again (e.g. after a lost response) returns the existing row
    client_uuid UUID,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name VARCHAR(25) NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    duration INTEGER NOT NULL,
    in_progress BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT workout_client_uuid_key UNIQUE (user_id, client_uuid)
);

CREATE TABLE workout_exercise (
    id SERIAL PRIMARY KEY,
    -- Set by the client on creation, so that a create that is sent again (e.g. after a lost response) returns the existing row
    client_uuid UUID,
    workout_id INTEGER NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercise(id),
    unilateral BOOLEAN NOT NULL,
    reps INTEGER[],
    weights NUMERIC(5,1)[],
    "time" INTEGER[],
    intensity NUMERIC(6,2)[],
    distance NUMERIC(9,3)[],
    index INTEGER NOT NULL,
    -- Set arrays are NULL if the exercise does not track the metric, otherwise they contain no NULL values.
    -- array_position finds NULL values and returns NULL for a NULL array, so untracked metrics pass the check.
    CONSTRAINT workout_exercise_reps_no_null_check      CHECK (array_position(reps, NULL) IS NULL),
    CONSTRAINT workout_exercise_weights_no_null_check   CHECK (array_position(weights, NULL) IS NULL),
    CONSTRAINT workout_exercise_time_no_null_check      CHECK (array_position("time", NULL) IS NULL),
    CONSTRAINT workout_exercise_intensity_no_null_check CHECK (array_position(intensity, NULL) IS NULL),
    CONSTRAINT workout_exercise_distance_no_null_check  CHECK (array_position(distance, NULL) IS NULL),
    CONSTRAINT workout_exercise_client_uuid_key UNIQUE (workout_id, client_uuid)
);

CREATE TABLE workout_scheme (
    id SERIAL PRIMARY KEY,
    -- Set by the client on creation, so that a create that is sent again (e.g. after a lost response) returns the existing row
    client_uuid UUID,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name VARCHAR(25) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    last_performed TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT workout_scheme_client_uuid_key UNIQUE (user_id, client_uuid)
);

CREATE TABLE workout_scheme_exercise (
    id SERIAL PRIMARY KEY,
    workout_scheme_id INTEGER NOT NULL REFERENCES workout_scheme(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercise(id),
    index INTEGER NOT NULL
);

CREATE TABLE chat (
    id SERIAL PRIMARY KEY,
    group_chat BOOLEAN NOT NULL,
    name VARCHAR(25),
    image_url VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL,
    created_by INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    public BOOLEAN NOT NULL,
    latest_message_timestamp TIMESTAMPTZ,
    latest_message_preview VARCHAR(50),
    latest_message_sender_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    name_updated_at TIMESTAMPTZ,
    name_updated_by INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    image_updated_at TIMESTAMPTZ,
    image_updated_by INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    public_updated_at TIMESTAMPTZ,
    public_updated_by INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE chat_user (
    chat_id INTEGER NOT NULL REFERENCES chat(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    last_read_message_id BIGINT NOT NULL,
    -- Lets /chat/get_delta deliver the chats a user was added to
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Admins of a group chat can rename it, change its image, make it public or private, add and remove members,
    -- make other members admins and delete it. NULL for direct chats.
    admin BOOLEAN,
    PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE message (
    id BIGSERIAL PRIMARY KEY,
    -- Set by the client on creation, so that a create that is sent again (e.g. after a lost response) returns the existing row
    client_uuid UUID,
    sender_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    chat_id INTEGER NOT NULL REFERENCES chat(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    content TEXT,
    image_url VARCHAR(64),
    deleted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    CONSTRAINT message_client_uuid_key UNIQUE (sender_id, client_uuid)
);

CREATE TABLE ai_conversation (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    title VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL,
    -- Set whenever a message is added or the conversation is renamed, so the newest conversations can be listed first
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE ai_message (
    id BIGSERIAL PRIMARY KEY,
    -- Set by the client on the user's messages, so that a message that is sent again (e.g. after a lost response) returns the existing answer
    client_uuid UUID,
    conversation_id INTEGER NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
    -- "user" for messages of the user, "assistant" for the answers of the LLM
    role VARCHAR(9) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ai_message_client_uuid_key UNIQUE (conversation_id, client_uuid)
);

CREATE TABLE session (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) UNIQUE NOT NULL,
    agent VARCHAR(255) NOT NULL,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL
);

-- Reports of users, chats and messages for the admin to review. Each report references exactly one of them, a
-- report of a message doesn't set the user or chat. Removed with the reporter; an admin removes it once it is handled.
-- NudeNet reports uploaded images that it blocked or flagged by itself, without a reporter.
CREATE TABLE report (
    id SERIAL PRIMARY KEY,
    -- NULL for the automatic reports of NudeNet (app/core/nudity_filter.py), which have the uploader instead
    reporter_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
    -- The user who uploaded the image of an automatic report, set to NULL when they are removed for good
    uploader_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    -- Set to NULL when the reported row is removed for good, the copies below keep what was reported
    reported_user_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    reported_chat_id INTEGER REFERENCES chat(id) ON DELETE SET NULL,
    reported_message_id BIGINT REFERENCES message(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Copies of the reported content at the time of the report, so it can still be reviewed after the sender deleted
    -- or changed it. The images are copies with their own hash, owned by the report and removed with it.
    -- A report of a user: user_name, profile_image. Of a group chat: chat_name, chat_image.
    -- Of a message: message_text, message_image and the sender's user_name.
    user_name VARCHAR(20),
    profile_image VARCHAR(64),
    chat_name VARCHAR(25),
    chat_image VARCHAR(64),
    message_text TEXT,
    message_image VARCHAR(64),
    -- Exactly one is set by the API, none once the reported row was removed (or for an automatic report of a blocked
    -- upload whose message or group was never created)
    CHECK (num_nonnulls(reported_user_id, reported_chat_id, reported_message_id) <= 1),
    CHECK (reporter_id IS NULL OR uploader_id IS NULL)
);

-- The requests the API answered, counted per hour (app/core/request_stats.py) for the traffic page of the admin.
-- No user ids or addresses. Rows older than 90 days are removed by the prune job.
CREATE TABLE request_stats (
    -- Start of the hour (UTC) the requests were answered in
    hour TIMESTAMPTZ NOT NULL,
    -- Route template, e.g. /v1/workouts/{workout_id}, or '' for requests that matched no route
    route VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status SMALLINT NOT NULL,
    -- First path segment like v1, or '' for paths without a version
    api_version VARCHAR(10) NOT NULL,
    -- From the User-Agent: 'ios', 'web' or 'other'
    platform VARCHAR(5) NOT NULL CHECK (platform IN ('ios', 'web', 'other')),
    requests INTEGER NOT NULL,
    duration_ms_sum BIGINT NOT NULL,
    duration_ms_max INTEGER NOT NULL,
    -- Number of requests per duration bucket (REQUEST_DURATION_BUCKETS_MS, the last one counts the slower requests)
    duration_buckets INTEGER[] NOT NULL,
    PRIMARY KEY (hour, route, method, status, api_version, platform)
);

-- Indexes

CREATE UNIQUE INDEX user_oauth_idx ON "user" (oauth_provider, oauth_id);
CREATE INDEX user_pw_reset_token_idx ON "user" (pw_reset_token) WHERE pw_reset_token IS NOT NULL;
CREATE INDEX session_user_id_idx ON session (user_id);

CREATE INDEX friend_user_id_2_idx ON friend (user_id_2);
CREATE INDEX friend_request_receiver_id_idx ON friend_request (receiver_id);
CREATE INDEX blocked_users_blocked_id_idx ON blocked_users (blocked_id);
CREATE INDEX report_reporter_id_idx ON report (reporter_id) WHERE reporter_id IS NOT NULL;
CREATE INDEX report_uploader_id_idx ON report (uploader_id) WHERE uploader_id IS NOT NULL;
CREATE INDEX report_reported_user_id_idx ON report (reported_user_id) WHERE reported_user_id IS NOT NULL;
CREATE INDEX report_reported_chat_id_idx ON report (reported_chat_id) WHERE reported_chat_id IS NOT NULL;
CREATE INDEX report_reported_message_id_idx ON report (reported_message_id) WHERE reported_message_id IS NOT NULL;

CREATE INDEX exercise_user_id_idx ON exercise (user_id);

CREATE INDEX workout_user_id_idx ON workout (user_id);
CREATE INDEX workout_exercise_workout_id_idx ON workout_exercise (workout_id);
CREATE INDEX workout_exercise_exercise_id_idx ON workout_exercise (exercise_id);
CREATE INDEX workout_scheme_user_id_idx ON workout_scheme (user_id);
CREATE INDEX workout_scheme_exercise_scheme_id_idx ON workout_scheme_exercise (workout_scheme_id);
CREATE INDEX workout_scheme_exercise_exercise_id_idx ON workout_scheme_exercise (exercise_id);

CREATE INDEX chat_user_user_id_idx ON chat_user (user_id, chat_id);
CREATE INDEX message_chat_id_created_at_idx ON message (chat_id, created_at);
CREATE INDEX chat_public_idx ON chat (id) WHERE public AND group_chat AND deleted_at IS NULL;

CREATE INDEX ai_conversation_user_id_idx ON ai_conversation (user_id, updated_at);
CREATE INDEX ai_message_conversation_id_idx ON ai_message (conversation_id, id);
