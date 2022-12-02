const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};
initializeDBAndServer();

//API1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user (username,password,name,gender) VALUES ('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatchedPassword = await bcrypt.compare(password, dbUser.password);
    if (isMatchedPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_CODE");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with JWT Token
const authenticationToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_CODE", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  }
};

//API3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
    const getFollowerIds = await db.all(getFollowerIdQuery);
    const getFollowerIdsEach = getFollowerIds.map((eachId) => {
      return eachId.following_user_id;
    });
    const getTweetQuery = `SELECT user.username, tweet.tweet, tweet.date_time as dateTime 
      FROM user inner join tweet 
      ON user.user_id= tweet.user_id WHERE user.user_id in (${getFollowerIdsEach})
      ORDER BY tweet.date_time DESC LIMIT 4 ;`;
    const responseResult = await db.all(getTweetQuery);
    response.send(responseResult);
  }
);

//API4
app.get("/user/following/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdQuery);
  const getFollowerIdsEach = getFollowerIds.map((eachId) => {
    return eachId.following_user_id;
  });
  const getFollowersUserId = `SELECT name FROM user WHERE user_id in (${getFollowerIdsEach});`;
  const responseResult = await db.all(getFollowersUserId);
  response.send(responseResult);
});

//API5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdQuery);
  const getFollowerIdsEach = getFollowerIds.map((eachId) => {
    return eachId.follower_user_id;
  });
  const getFollowersUserId = `SELECT name FROM user WHERE user_id in (${getFollowerIdsEach});`;
  const responseResult = await db.all(getFollowersUserId);
  response.send(responseResult);
});

//API6
const result = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdQuery);
  const getFollowerIdsEach = getFollowerIds.map((eachId) => {
    return eachId.following_user_id;
  });
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowerIdsEach});`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
    const likes_count = await db.get(likes_count_query);
    const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
    const reply_count = await db.get(reply_count_query);
    const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
    const tweet_tweetDate = await db.get(tweet_tweetDateQuery);
    response.send(result(tweet_tweetDate, likes_count, reply_count));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API7
const converterApi7 = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowerIdQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${getUserId.user_id};`;
    const getFollowerIds = await db.all(getFollowerIdQuery);
    const getFollowerIdsEach = getFollowerIds.map((eachId) => {
      return eachId.follower_user_id;
    });
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowerIdsEach});`;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like
              on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
      const getLikedUserNamesArray = await db.all(getLikedUsersNameQuery);
      const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
        return eachUser.likes;
      });
      response.send(converterApi7(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API8
const converterApi8 = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getFollowerIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`;
    const getFollowerIds = await db.all(getFollowerIdQuery);
    const getFollowerIdsEach = getFollowerIds.map((eachId) => {
      return eachId.following_user_id;
    });
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowerIdsEach});`;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.name,reply.reply as reply from user inner join reply
              on user.user_id=reply.user_id where reply.tweet_id=${tweetId};`;
      const getLikedUserNames = await db.all(getLikedUsersNameQuery);
      response.send(converterApi8(getLikedUserNames));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const getTweetIdsQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });
  response.send(getTweetIds);
});

//API10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  const { tweet } = request.body;
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));
  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;
  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//API11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
