-- Solo se ejecuta al inicializar un volumen vacío. No contiene credenciales.
\getenv app_user POSTGRES_APP_USER
\getenv app_password POSTGRES_APP_PASSWORD
\getenv database POSTGRES_DB

CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE :"database" TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
