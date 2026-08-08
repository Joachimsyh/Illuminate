import { prisma } from "../src/lib/prisma";
import { autoApply } from "../src/lib/auto-apply";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "smoke@luma-autoapply.dev" },
    update: {},
    create: {
      email: "smoke@luma-autoapply.dev",
      name: "Smoke Tester",
      headline: "Engineer",
      company: "Illuminate",
      bio: "Testing auto-apply pipeline",
      linkedinId: "smoke-tester",
    },
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
  .finally(() => prisma.$disconnect());
