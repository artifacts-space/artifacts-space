-- generate_public_id(): a 22-character random base58 id (about 129 bits),
-- the database's fallback for artifact.public_id. The app generates the same
-- shape in src/lib/public-id.ts. Bytes come from gen_random_uuid(), which uses
-- the server's strong random source; the six fixed version and variant bits
-- (bytes 6 and 8) are skipped, and rejection sampling (< 232 = 4 * 58) keeps
-- every character uniform.
CREATE OR REPLACE FUNCTION generate_public_id() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
	alphabet constant text := '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
	result text := '';
	bytes bytea;
	value int;
	i int;
BEGIN
	WHILE length(result) < 22 LOOP
		bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
		FOR i IN 0..15 LOOP
			CONTINUE WHEN i = 6 OR i = 8;
			value := get_byte(bytes, i);
			CONTINUE WHEN value >= 232;
			result := result || substr(alphabet, (value % 58) + 1, 1);
			EXIT WHEN length(result) = 22;
		END LOOP;
	END LOOP;
	RETURN result;
END;
$$;
