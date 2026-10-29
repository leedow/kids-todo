from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.db import models  # noqa: F401
from app.db.session import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:

    def migrate(connection):
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

    supplied = config.attributes.get("connection")
    if supplied is not None:
        migrate(supplied)
    else:
        engine = create_engine(get_settings().database_url, poolclass=pool.NullPool)
        with engine.connect() as connection:
            migrate(connection)
