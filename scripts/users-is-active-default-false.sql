-- New users are inactive until explicitly activated (e.g. after email/phone verification).
ALTER TABLE users
  ALTER COLUMN "isActive" SET DEFAULT false;
