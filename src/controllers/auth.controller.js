const jwt = require("jsonwebtoken");
const ApiError = require("../utils/apiError");
const User = require("../models/User");

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, "Server configuration error: JWT secret not configured");
  }
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    secret,
    { expiresIn: "7d" }
  );
}

exports.register = async (req, res) => {
  const { name, username, email, password, gender, city } = req.body;

  if (!name || !username || !email || !password || !gender || !city) {
    throw new ApiError(400, "Name, username, email, password, gender, and city are required");
  }

  const existingEmail = await User.findOne({ email: email.toLowerCase() });
  if (existingEmail) {
    throw new ApiError(409, "Email already registered");
  }

  const existingUsername = await User.findOne({ username: username.toLowerCase() });
  if (existingUsername) {
    throw new ApiError(409, "Username already taken");
  }

  const user = await User.create({
    name,
    username,
    email,
    password,
    gender,
    city,
    provider: "local",
  });
  const token = signToken(user);

  res.status(201).json({
    success: true,
    data: { user: user.toPublicJSON(), token },
  });
};

exports.oauthRegister = async (req, res) => {
  const { name, email, uid, provider, username, gender, city } = req.body;

  if (!name || !email || !uid || !provider || !username || !gender) {
    throw new ApiError(400, "Name, email, uid, provider, username, and gender are required");
  }

  let user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    const token = signToken(user);
    return res.json({
      success: true,
      data: { user: user.toPublicJSON(), token },
    });
  }

  const existingUsername = await User.findOne({ username: username.toLowerCase() });
  if (existingUsername) {
    throw new ApiError(409, "Username already taken");
  }

  user = await User.create({
    name,
    username,
    email,
    gender,
    city,
    provider,
  });
  const token = signToken(user);

  res.status(201).json({
    success: true,
    data: { user: user.toPublicJSON(), token },
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password"
  );

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = signToken(user);

  res.json({
    success: true,
    data: { user: user.toPublicJSON(), token },
  });
};

exports.oauthLogin = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({
    email: email.toLowerCase(),
    provider: { $ne: "local" },
  });

  if (!user) {
    throw new ApiError(401, "No OAuth account found with this email");
  }

  const token = signToken(user);

  res.json({
    success: true,
    data: { user: user.toPublicJSON(), token },
  });
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  res.json({ success: true, data: user.toPublicJSON() });
};
