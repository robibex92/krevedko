import { BaseController } from "../core/base/BaseController.js";
import { avatarUpload } from "../services/uploads.js";
import { publicUser } from "../middleware/auth.js";
import { toUserProfileDTO } from "../dto/UserDTO.js";

/**
 * Controller for profile endpoints
 */
export class ProfileController extends BaseController {
  constructor(profileService) {
    super();
    this.profileService = profileService;
  }

  /**
   * GET /api/profile/me
   * Get user profile with orders
   */
  getProfile = async (req, res) => {
    const userId = this.getUserId(req);

    const profile = await this.profileService.getProfile(userId);

    // Применяем DTO для профиля (уменьшает размер, убирает sensitive поля)
    const optimizedProfile = {
      ...profile,
      user: toUserProfileDTO(profile.user),
    };

    this.success(res, optimizedProfile);
  };

  /**
   * PATCH /api/profile
   * Update user profile
   */
  updateProfile = async (req, res) => {
    const userId = this.getUserId(req);
    const updates = req.body || {};

    const updatedUser = await this.profileService.updateProfile(
      userId,
      updates
    );

    // Update session with new user data
    req.session.user = publicUser(updatedUser);

    // Применяем DTO для профиля
    const userDTO = toUserProfileDTO(updatedUser);

    this.success(res, { user: userDTO });
  };

  /**
   * POST /api/profile/avatar
   * Upload user avatar
   */
  uploadAvatar = (req, res, next) => {
    const userId = this.getUserId(req);
    const uploadLimitMb = Number(process.env.UPLOAD_LIMIT_MB) || 5;

    // Log incoming request
    try {
      console.log("[upload/avatar] incoming", {
        ip: req.ip,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        userId,
        uploadLimitMb,
      });
    } catch (error) {
      // Ignore logging errors
    }

    // Handle multer upload
    const avatarSingle = avatarUpload.single("avatar");
    avatarSingle(req, res, (err) => {
      if (err) {
        const payload = {
          code: err?.code,
          message: err?.message,
          name: err?.name,
        };
        console.error("[upload/avatar] multer error", payload);

        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({ error: "FILE_TOO_LARGE", limitMb: uploadLimitMb });
        }

        return res
          .status(400)
          .json({ error: "UPLOAD_FAILED", reason: err.message || String(err) });
      }

      return next();
    });
  };

  /**
   * POST /api/profile/avatar - handler after upload
   */
  saveAvatar = async (req, res) => {
    const userId = this.getUserId(req);

    if (!req.file) {
      console.warn("[upload/avatar] no file received after multer");
      return res.status(400).json({ error: "NO_FILE" });
    }

    try {
      console.log("[upload/avatar] saved", {
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        path: req.file.path,
      });
    } catch (error) {
      // Ignore logging errors
    }

    const relPath = ["avatars", req.file.filename].join("/");

    const updatedUser = await this.profileService.updateAvatar(userId, relPath);

    // Update session with new user data
    req.session.user = publicUser(updatedUser);

    this.success(res, { avatarPath: relPath });
  };
}
