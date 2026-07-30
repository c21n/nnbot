import { describe, expect, it } from "vitest";
import { PersonaService } from "./persona.js";

describe("PersonaService", () => {
  it("uses the workbench identity without exposing the bot framework name", async () => {
    const service = new PersonaService({} as never);
    const persona = await service.getPersona("user-1");

    expect(persona).toContain("你是华傲智能业务工作台的企业内部助手");
    expect(persona).toContain("专利助手");
    expect(persona).not.toContain("你是 NNBot");
    expect(persona).toContain("我是华傲智能业务工作台助手");
  });
});
