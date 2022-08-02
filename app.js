const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let database;
const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//API -1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectedQuery = `
     SELECT 
     * 
     FROM 
     user 
     WHERE 
     username= '${username}';`;
  const dbUser = await database.get(selectedQuery);
  if (dbUser) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const addNewUserQuery = `
        INSERT INTO user (name, username, password, gender) 
        VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');
        `;
    await database.run(addNewUserQuery);
    response.send("User created successfully");
  }
});

//API- 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT 
     * 
     FROM 
     user 
     WHERE 
      username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with JWT Token

const authenticateUser = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (!authHeader) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "MY_SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-3

app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectedUerQuery = ` 
     SELECT 
      * 
    FROM 
    user 
    WHERE 
    username= '${username}';`;
  const dbUser = await database.get(selectedUerQuery);

  const followingUserQuery = `
     SELECT 
      following_user_id 
      FROM 
      follower 
      WHERE 
      follower_user_id = ${dbUser.user_id};`;
  const followingUserObjectList = await database.all(followingUserQuery);
  const followingUserList = followingUserObjectList.map((object) => {
    return object["following_user_id"];
  });
  const getTweetsQuery = `
  SELECT 
    user.username AS username, 
    tweet.tweet AS tweet, 
    tweet.date_time AS dateTime
  FROM 
    tweet 
    INNER JOIN user ON tweet.user_id = user.user_id 
  WHERE
    tweet.user_id IN (
        ${followingUserList}
    )
  ORDER BY tweet.date_time DESC 
  LIMIT 4;`;

  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

//API-4

app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const followingUsersQuery = ` 
   SELECT 
    following_user_id 
    FROM 
    follower 
    WHERE 
    follower_user_id = ${dbUser.user_id};`;
  const followingUsersObjectsList = await database.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });

  const getFollowingQuery = `
   SELECT 
    user.name AS name
    FROM 
    user 
    WHERE 
    user_id IN (
        ${followingUsersList}
    );`;

  const following = await database.all(getFollowingQuery);
  response.send(following);
});

//API -5

app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const followerUsersQuery = `
    SELECT follower_user_id FROM follower 
    WHERE following_user_id = ${dbUser.user_id};
  `;
  const followerUsersObjectsList = await database.all(followerUsersQuery);
  const followerUsersList = followerUsersObjectsList.map((object) => {
    return object["follower_user_id"];
  });
  const getFollowersQuery = `
  SELECT 
    user.name AS name
  FROM 
    user
  WHERE
    user_id IN (
        ${followerUsersList}
    );
  `;
  const followers = await database.all(getFollowersQuery);
  response.send(followers);
});

//API-6

app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const selectUserQuery = `
      SELECT 
       * 
       FROM 
       user 
       WHERE 
       username= '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getTweetQuery = ` 
   SELECT 
    * 
    FROM 
    tweet 
    WHERE 
    tweet_id = ${tweetId};`;
  const tweetUser = await database.get(getTweetQuery);
  const followingUsersQuery = `
   SELECT 
     following_user_id
    FROM
      follower 
    WHERE 
    follower_id = ${dbUser.user_id};`;
  const followingUsersObjectsList = await database.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  if (!followingUsersList.includes(tweetUser.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet_id, date_time, tweet } = tweetUser;
    const getLikesQuery = `
       SELECT 
        COUNT(like_id) as likes 
        FROM 
        like 
        WHERE 
         tweet_id = ${tweet_id} 
        GROUP BY 
         tweet_id;`;
    const likesObject = await database.get(getLikesQuery);
    const getRepliesQuery = `
    SELECT 
    COUNT(reply_id) AS replies 
    FROM reply 
    WHERE 
    tweet_id = ${tweet_id} GROUP BY tweet_id;`;
    const repliesObject = await database.get(getRepliesQuery);
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  }
});

//API-7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetInfo = await database.get(getTweetQuery);
    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};`;
    const followingUsersObjectsList = await database.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getLikesQuery = `
        SELECT user_id FROM like 
        WHERE tweet_id = ${tweet_id};`;
      const likedUserIdObjectsList = await database.all(getLikesQuery);
      const likedUserIdsList = likedUserIdObjectsList.map((object) => {
        return object.user_id;
      });
      const getLikedUsersQuery = `
      SELECT username FROM user 
      WHERE user_id IN (${likedUserIdsList});`;
      const likedUsersObjectsList = await database.all(getLikedUsersQuery);
      const likedUsersList = likedUsersObjectsList.map((object) => {
        return object.username;
      });
      response.send({
        likes: likedUsersList,
      });
    }
  }
);

//API-8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
   SELECT 
    * 
    FROM 
    user 
    WHERE 
    username='${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const getTweetQuery = ` 
     SELECT 
      * 
      FROM 
      tweet 
      WHERE 
      tweet_id = ${tweetId};`;
    const tweetInfo = await database.get(getTweetQuery);
    const followingUsersQuery = ` 
       SELECT 
        following_user_id 
        FROM 
        follower 
        WHERE 
        follower_user_id = ${dbUser.user_id};`;
    const followingUsersObjectsList = await database.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((eachItem) => {
      return eachItem["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
         SELECT 
          user.name as name,
          reply.reply as reply 
         FROM 
         reply 
         INNER JOIN user 
         ON  reply.user_id = user.user_id 
         WHERE 
         reply.tweet_id = ${tweetId};`;
      const userRepliesObject = await database.all(getUserRepliesQuery);
      response.send({
        replies: userRepliesObject,
      });
    }
  }
);

//API-9

app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  const getTweetsQuery = `
     SELECT 
      * 
    FROM 
    tweet 
    WHERE 
    user_id = ${user_id}
    ORDER BY 
    tweet_id;`;
  const tweetObjectsList = await database.all(getTweetsQuery);
  const tweetIdsList = tweetObjectsList.map((object) => {
    return object.tweet_id;
  });
  const getLikesQuery = `
     SELECT 
      COUNT(like_id) AS likes 
      FROM 
      like
      WHERE 
      tweet_id IN (${tweetIdsList})
      GROUP BY 
       tweet_id 
      ORDER BY 
       tweet_id;`;
  const likesObjectsList = await database.all(getLikesQuery);
  const getRepliesQuery = ` 
     SELECT 
      COUNT(reply_id) AS replies 
      FROM 
      reply 
      WHERE 
       tweet_id IN (${tweetIdsList})
      GROUP BY 
      tweet_id 
      ORDER BY 
       tweet_id;`;
  const repliesObjectsList = await database.all(getRepliesQuery);
  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0;
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0;
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

//API -10

app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  const { tweet } = request.body;
  const dateString = new Date().toISOString();
  const dateTime = dateString.slice(0, 10) + " " + dateString.slice(11, 19);
  const addNewTweetQuery = `
     INSERT INTO 
      tweet (tweet,user_id,date_time)
      VALUES 
       ('${tweet}','${user_id}','${dateTime}');`;
  await database.run(addNewTweetQuery);
  response.send("Created a Tweet");
});

//API-11

app.delete("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetInfo = await database.get(getTweetQuery);
  if (dbUser.user_id !== tweetInfo.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
       DELETE FROM 
       tweet 
       WHERE 
       tweet_id = ${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
