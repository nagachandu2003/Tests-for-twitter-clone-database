const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

let loggedUser = null;

const authenticateUser = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "jfkhrgsgdjhtdsk", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const getIdQuery = `Select user_id from user where username = '${payload.username}'`;
        let resId = await db.get(getIdQuery);
        loggedUser = resId.user_id;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT * from user where username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `
            INSERT INTO user(username,password,name,gender)
            VALUES(
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );`;
      const res1 = await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * from user where username = '${username}'`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, dbUser.password);
    if (isPasswordValid === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "jfkhrgsgdjhtdsk");
      response.send({ jwtToken: jwtToken });
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const getTweetQuery = `
      select user.username, tweet, date_time as dateTime from tweet inner join user on tweet.user_id = user.user_id where tweet.user_id in (select following_user_id from follower where follower_user_id = ${loggedUser}) ORDER BY date_time desc limit 4 ;`;
  const res3 = await db.all(getTweetQuery);
  response.send(res3);
});

//API 4
app.get("/user/following/", authenticateUser, async (request, response) => {
  const getFollowersQuery = `select distinct(user.name) from user where user_id in (select following_user_id from follower where follower_user_id = ${loggedUser});`;
  const res4 = await db.all(getFollowersQuery);
  response.send(res4);
});

//API 5
app.get("/user/followers/", authenticateUser, async (request, response) => {
  const getFollowingQuery = `
    select user.name from user inner join follower on user.user_id = follower.follower_user_id where follower.following_user_id = ${loggedUser};`;
  const res5 = await db.all(getFollowingQuery);
  response.send(res5);
});

//API 6
app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const getFollowingUsersQuery = `SELECT following_user_id from follower where follower_user_id = ${loggedUser};`;
  const Followers = await db.all(getFollowingUsersQuery);
  const FollowersArray = Followers.map((ele) => ele.following_user_id);
  const getUserIdQuery = `SELECT user_id from tweet where tweet_id = ${tweetId};`;
  const tweetedUser = await db.get(getUserIdQuery);
  const isAFollower = FollowersArray.includes(tweetedUser.user_id);
  if (isAFollower === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetailsQuery =
      //select tweet, count(distinct(like_id)) as likes, count(distinct(reply_id)) as replies, date_time as dateTime from tweet inner join like inner join reply on tweet.tweet_id = like.tweet_id = reply.tweet_id where tweet.tweet_id = ${tweetId} group by tweet.tweet_id;
      `select tweet, count(distinct(like_id)) as likes, count(distinct(reply_id)) as replies, date_time as dateTime from tweet inner join like inner join reply on tweet.tweet_id = like.tweet_id AND tweet.tweet_id = reply.tweet_id where tweet.tweet_id = ${tweetId} group by tweet.tweet_id;`;
    const res6 = await db.get(getTweetDetailsQuery);
    response.send(res6);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const getFollowingUsersQuery = `SELECT following_user_id from follower where follower_user_id = ${loggedUser};`;
    const Followers = await db.all(getFollowingUsersQuery);
    const FollowersArray = Followers.map((ele) => ele.following_user_id);
    const getUserIdQuery = `SELECT user_id from tweet where tweet_id = ${tweetId};`;
    const tweetedUser = await db.get(getUserIdQuery);
    const isAFollower = FollowersArray.includes(tweetedUser.user_id);
    if (isAFollower === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikedUsers = `
        select user.username from user inner join like on user.user_id = like.user_id where like.tweet_id = ${tweetId};`;
      const res7 = await db.all(getLikedUsers);
      response.send({ likes: res7.map((ele) => ele.username) });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const getFollowingUsersQuery = `SELECT following_user_id from follower where follower_user_id = ${loggedUser};`;
    const Followers = await db.all(getFollowingUsersQuery);
    const FollowersArray = Followers.map((ele) => ele.following_user_id);
    const getUserIdQuery = `SELECT user_id from tweet where tweet_id = ${tweetId};`;
    const tweetedUser = await db.get(getUserIdQuery);
    const isAFollower = FollowersArray.includes(tweetedUser.user_id);
    if (isAFollower === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `
        select user.name,reply.reply from user inner join reply on user.user_id = reply.user_id where reply.tweet_id = ${tweetId};`;
      const res8 = await db.all(getRepliesQuery);
      response.send({ replies: res8 });
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const getTweetsQuery = `
    select tweet, count(distinct(like_id)) as likes, count(distinct(reply_id)) as replies, date_time as dateTime from tweet inner join like inner join reply on tweet.tweet_id = like.tweet_id AND tweet.tweet_id = reply.tweet_id where tweet.tweet_id IN (select tweet_id from tweet where user_id = ${loggedUser}) group by tweet.tweet_id;`;
  const res9 = await db.all(getTweetsQuery);
  response.send(res9);
});

//API 10
app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { tweet } = request.body;
  const addTweetQuery = `
    INSERT INTO tweet(tweet,user_id)
    VALUES('${tweet}', ${loggedUser});`;
  const res10 = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const getUserId = `SELECT user_id FROM tweet where tweet_id = ${tweetId};`;
  const tweetedUser = await db.get(getUserId);
  if (tweetedUser.user_id !== loggedUser) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
    DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    const res11 = await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
