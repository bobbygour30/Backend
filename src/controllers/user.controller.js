import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
const registerUser = asyncHandler(async (req, res) => {
  // get user's details from frontend
  //validation of user's details - not empty
  //check if user already exists
  //check for images and avatar
  // upload them to cloudinary , avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return response

  const { fullName, email, password } = req.body;
  console.log("email: ", email);

  if (fullName === "") {
    throw new ApiError(400, "fullName cannot be empty");
  }
  if (email === "") {
    throw new ApiError(400, "email cannot be empty");
  }
  if (password === "") {
    throw new ApiError(400, "password cannot be empty");
  }

  const existedUser = User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;
  if (!avatarLocalPath || !coverImageLocalPath) {
    throw new ApiError(400, "Please upload avatar and cover image");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar || !coverImage) {
    throw new ApiError(500, "Failed to upload images on cloudinary");
  }

  const user = await User.create({
    fullName,
    username: username.toLowerCase(),
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage.url || "",
  });

  const createdUser = await User.findOne(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Failed to create user");
  }
  return res
    .status(201)
    .json(new ApiResponse(200, "User created successfully", createdUser));
});

export { registerUser };
