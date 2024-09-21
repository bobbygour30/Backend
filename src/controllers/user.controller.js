import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
  // Get user's details from frontend
  const { fullName, email, password, username } = req.body; // Extract username from req.body
  console.log("email: ", email);

  // Validation of user's details - not empty
  if (!fullName) {
    throw new ApiError(400, "Full name cannot be empty");
  }
  if (!email) {
    throw new ApiError(400, "Email cannot be empty");
  }
  if (!password) {
    throw new ApiError(400, "Password cannot be empty");
  }
  if (!username) {
    throw new ApiError(400, "Username cannot be empty");
  }

  // Check if user already exists
  const existedUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }
  //console.log(req.files);
  

  // Check for images (avatar and cover image) and upload them to Cloudinary
  const avatarFile = req.files?.avatar?.[0];
  const coverImageFile = req.files?.coverImage?.[0];
  
  if (!avatarFile || !coverImageFile) {
    throw new ApiError(400, "Please upload both avatar and cover image");
  }

  let avatar, coverImage;
  try {
    avatar = await uploadOnCloudinary(avatarFile.path);
    coverImage = await uploadOnCloudinary(coverImageFile.path);
  } catch (error) {
    throw new ApiError(500, "Failed to upload images to Cloudinary");
  }

  if (!avatar || !coverImage) {
    throw new ApiError(500, "Image upload to Cloudinary failed");
  }

  // Create user object and save in the database
  const user = await User.create({
    fullName,
    username: username.toLowerCase(),
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage.url,
  });

  // Remove password and refresh token field from response
  const createdUser = await User.findOne({ _id: user._id }).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Failed to create user");
  }

  // Return response
  return res
    .status(201)
    .json(new ApiResponse(201, "User created successfully", createdUser));
});

export { registerUser };
