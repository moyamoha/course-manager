import bcrypt from "bcrypt";
import fs from "fs";
import util from "util";
import jwt from "jsonwebtoken";

import User from "../models/user.model.js";
import UserServices from "../services/user.services.js";
import secrets from "../utils/secrets.js";

const unlinkFile = util.promisify(fs.unlink);

export const registerUser = async (req, res) => {
  const { username, lastname, firstname, password1, password2, email } =
    req.body;
  if (password1 !== password2) {
    res.status(400).json({ message: "Passwords should match" });
    return;
  }
  if (password1.length < 10) {
    res.status(400).json({ message: "Password is too short" });
    return;
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password1, 10);
  } catch (err) {
    res.sendStatus(500);
    return;
  }
  try {
    await UserServices.createUser({
      username: username,
      lastname: lastname,
      firstname: firstname,
      password: hashedPassword,
      email: email,
      dateJoined: Date.now(),
    });
    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(401).json({ message: "Please provide correct information" });
  }
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  let user;
  try {
    user = await User.findOne({
      username: username,
    });
    console.log(user);
    if (!user) {
      res.status(401).json({
        message: "Wrong credentials. Please check your username and password",
      });
      return;
    }
    try {
      if (await bcrypt.compare(password, user.password)) {
        console.log("tuli tänne");
        const token = jwt.sign(
          JSON.stringify({
            _id: user._id,
            name: user.firstname + " " + user.lastname,
            email: user.email,
            dateJoined: user.dateJoined,
          }),
          secrets.jwtSecret
        );
        console.log("vielä tänne");
        res.json({
          token: token,
        });
      }
    } catch (err) {
      res.status(401).json({ message: "Password is incorrect" });
    }
  } catch (err) {
    res.sendStatus(500);
  }
};

export const setProfile = async (req, res, next) => {
  const img = req.file;
  const user = req.user;
  const key = user.username + "_profile." + img.mimetype.split("/")[1];
  try {
    const fileStream = fs.createReadStream(img.path);
    const params = {
      Key: key,
      Body: fileStream,
      Bucket: secrets.awsBucketName,
    };
    await s3Client.send(new PutObjectCommand(params));
    const getCommand = new GetObjectCommand({
      Key: key,
      Bucket: secrets.awsBucketName,
    });
    const signedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 2 * 24 * 60 * 60,
    });
    await unlinkFile(img.path);
    user.profile = key;
    const updated = await UserServices.updateUser(user);
    res.json({ user: updated, profileUrl: signedUrl });
  } catch (err) {
    res.sendStatus(500).json({ message: "Could not upload image" });
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const params = {
      Bucket: secrets.awsBucketName,
      Key: req.params.key,
    };
    const getCommand = new GetObjectCommand(params);
    const url = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 2 * 24 * 60 * 60,
    });
    res.json({ url: url });
  } catch (err) {
    next(err);
  }
};
