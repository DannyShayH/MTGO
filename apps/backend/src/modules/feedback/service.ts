import { MedusaService } from "@medusajs/framework/utils"
import Feedback from "./models/feedback"

/**
 * Generated CRUD only. Workflows create Feedback; no route updates or
 * deletes one (ADR-0010).
 */
class FeedbackModuleService extends MedusaService({ Feedback }) {}

export default FeedbackModuleService
