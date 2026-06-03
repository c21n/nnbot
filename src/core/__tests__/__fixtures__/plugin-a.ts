/**
 * Test plugin A - high priority (10)
 */
import { createPlugin } from "../../../core/create-plugin.js";

export default createPlugin({
  name: "plugin-a",
  priority: 10,
  async handle(_event, _services) {
    return { content: "from plugin-a" };
  },
});
