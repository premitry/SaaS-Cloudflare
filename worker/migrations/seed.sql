-- No seed inserts here. The first admin is bootstrapped automatically:
-- when there are no rows in `admins` and someone POSTs /api/admin/bootstrap
-- with a username + password, the worker creates the first admin.
-- You can also POST /api/admin/login with username=admin, password=admin123
-- on a fresh DB and the worker will accept it once and create the admin row.
SELECT 'seed: nothing to do; admin is bootstrapped at runtime' AS info;
