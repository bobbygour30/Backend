import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userID) => {
  try {
    const user = await User.findById(userID);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({
      validateBeforeSave: false,
    });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Something went wrong");
  }
};

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

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // username or email
  // find the user
  // password check
  // access token generate and refresh token generate
  // senfd cookie

  const { email, password, username } = req.body;
  if (!(email || username)) {
    throw new ApiError(400, "Please provide email and username");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findOne(user._id).select(
    "-password -refreshToken"
  );
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearcookie("accessToken", options)
    .clearcookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, "Unauthorized");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is invalid");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access token refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Unauthorized");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = User.findById(req.user?._id);
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(400, "Old password is incorrect");
  }
  user.password = newPassword;
  await user.save({
    validateBeforeSave: false,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(200, req.user, "Current user retrieved successfully")
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { email, fullName } = req.body;
  if (!email || !fullName) {
    throw new ApiError(400, "Please provide email and full name");
  }
  const user = User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        email,
        fullName,
      },
    },
    {
      new: true,
    }
  ).select("-password ");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalpath = (req.file?.path = req.file?.path);
  if (!avatarLocalpath) throw new ApiError(400, "Please provide avatar");

  const avatar = await uploadOnCloudinary(avatarLocalpath);
  if (!avatar)
    throw new ApiError(500, "Something went wrong while uploading avatar");

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    {
      new: true,
    }
  ).select("-password ");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});
const updateUserCoverimage = asyncHandler(async (req, res) => {
  const coverLocalpath = (req.file?.path = req.file?.path);
  if (!coverLocalpath) throw new ApiError(400, "Please provide cover image");

  const coverImage = await uploadOnCloudinary(coverLocalpath);
  if (!coverImage.url)
    throw new ApiError(500, "Something went wrong while uploading cover image");

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    {
      new: true,
    }
  ).select("-password ");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverimage,
};
