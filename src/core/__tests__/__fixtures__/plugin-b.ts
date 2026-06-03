/**
 * Test plugin B - medium priority (50)
 */
import { createPlugin } from "../../../core/create-plugin.js";

export default createPlugin({
  name: "plugin-b",
  priority: 50,
  async handle(_event, _services) {
    return { content: "from plugin-b" };
  },
});
