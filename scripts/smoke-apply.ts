import { pool } from "../src/lib/db";
import {
  createUser,
  findUserByEmail,
  updateUser,
} from "../src/lib/repos";
import { autoApply } from "../src/lib/auto-apply";

async function main() {
  const email = "smoke@luma-autoapply.dev";
  let user = await findUserByEmail(email);
  if (!user) {
    user = await createUser({
      email,
      name: "Smoke Tester",
      linkedinId: "smoke-tester",
    });
  }
  user = await updateUser(user.id, {
    headline: "Engineer",
    company: "Illuminate",
    bio: "Testing auto-apply pipeline",
    linkedinId: "smoke-tester",
  });

  const result = await autoApply({
    userId: user.id,
    eventId: "monad-blitz",
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
