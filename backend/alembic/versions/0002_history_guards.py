"""Protect immutable business evidence and closed daily instances."""

from alembic import op

revision = "0002_history_guards"
down_revision = "562fd8466cff"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE FUNCTION reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'immutable business history: %', TG_TABLE_NAME
                USING ERRCODE = '23514';
        END $$;
    """)
    for table in ("task_versions", "card_draw_options", "card_acquisition_records"):
        op.execute(
            f"CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION reject_history_change()"
        )
    op.execute("""
        CREATE FUNCTION protect_reward_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.earned_at <> OLD.earned_at
               OR NEW.day_id <> OLD.day_id OR NEW.user_id <> OLD.user_id THEN
                RAISE EXCEPTION 'reward evidence is immutable' USING ERRCODE = '23514';
            END IF;
            IF (OLD.state = 'claimed' AND NEW.state <> 'claimed')
               OR (OLD.state = 'drawing' AND NEW.state = 'available') THEN
                RAISE EXCEPTION 'reward state cannot move backwards' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER reward_evidence BEFORE UPDATE ON daily_rewards
            FOR EACH ROW EXECUTE FUNCTION protect_reward_evidence();
        CREATE FUNCTION protect_closed_instance() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF (SELECT business_date FROM user_days WHERE id = OLD.day_id)
               < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date THEN
                RAISE EXCEPTION 'past daily instance is read only' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER closed_instance BEFORE UPDATE OR DELETE ON task_instances
            FOR EACH ROW EXECUTE FUNCTION protect_closed_instance();
    """)


def downgrade():
    op.execute("DROP TRIGGER closed_instance ON task_instances; DROP FUNCTION protect_closed_instance()")
    op.execute("DROP TRIGGER reward_evidence ON daily_rewards; DROP FUNCTION protect_reward_evidence()")
    for table in ("task_versions", "card_draw_options", "card_acquisition_records"):
        op.execute(f"DROP TRIGGER immutable_history ON {table}")
    op.execute("DROP FUNCTION reject_history_change()")
