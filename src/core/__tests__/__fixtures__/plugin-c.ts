/**
 * Test plugin C - default priority (100)
 */
import { createPlugin } from "../../../core/create-plugin.js";

export default createPlugin({
  name: "plugin-c",
  async handle(_event, _services) {
    return { content: "from plugin-c" };
  },
});
