const express = require("express");
const app = express();
const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("./database/db");
app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.redirect("/w/대문");
});

app.get("/s/search", (req, res) => {
  db.all(
    `SELECT * FROM documents WHERE title LIKE '%${req.query.q}%' OR content LIKE '%${req.query.q}%';`,
    (err, data) => {
      res.render(__dirname + "/interface/search", {
        data: data,
        q: req.query.q,
      });
    }
  );
});

app.get("/w/:title", (req, res) => {
  db.all(
    `SELECT * FROM documents WHERE title='${req.params.title}'`,
    (err, data) => {
      if (data[0]?.title) {
        res.render(__dirname + "/interface/view", {
          title: data[0].title,
          content: data[0].content,
          editText: "편집",
        });
      } else {
        res.render(__dirname + "/interface/view", {
          title: req.params.title,
          content: "문서가 없습니다.",
          editText: "생성",
        });
      }
    }
  );
});

app.get("/w/edit/:title", (req, res) => {
  db.all(
    `SELECT * FROM documents WHERE title='${req.params.title}'`,
    (err, data) => {
      if (data[0]?.title) {
        res.render(__dirname + "/interface/edit", {
          title: data[0].title,
          content: data[0].content,
          method: "edit",
        });
      } else {
        res.render(__dirname + "/interface/edit", {
          title: req.params.title,
          content: "",
          method: "create",
        });
      }
    }
  );
});

app.get("/s/edit/commit/", (req, res) => {
  if (req.query.title === "대문" && !req.ip === "127.0.0.1") {
    res.send(
      `<script>alert('보호된 문서라 편집할 수 없습니다.'); location.href = '/w/${req.query.title}'</script>`
    );
  } else {
    db.all(
      `UPDATE documents SET content=${req.query.q} WHERE title='${req.query.title}'`
    );
    db.all(
      `SELECT * FROM history WHERE target='${req.query.title}'`,
      (err, data) => {
        db.all(
          `INSERT INTO history VALUES (${data.reverse()[0].rev + 1}, '${
            req.query.title
          }', '${new Date()}', '${req.ip}', 'edit', '${req.query.sum}', ${
            req.query.q
          })`
        );
      }
    );
    res.send(
      `<script>alert('편집했습니다.'); location.href = '/w/${req.query.title}'</script>`
    );
  }
});

app.get("/s/edit/create/", (req, res) => {
  db.all(`INSERT INTO documents VALUES ('${req.query.title}', ${req.query.q})`);
  db.all(
    `SELECT * FROM history WHERE target='${req.query.title}'`,
    (err, data) => {
      if (data.reverse()[0]?.rev) {
        db.all(
          `INSERT INTO history VALUES (${data[0].rev + 1}, '${
            req.query.title
          }', '${new Date()}', '${req.ip}', 'create', '${req.query.sum}', ${
            req.query.q
          })`
        );
      } else {
        db.all(
          `INSERT INTO history VALUES (1, '${
            req.query.title
          }', '${new Date()}', '${req.ip}', 'create', '${req.query.sum}', ${
            req.query.q
          })`
        );
      }
    }
  );
  res.send(
    `<script>alert('편집했습니다.'); location.href = '/w/${req.query.title}'</script>`
  );
});

app.get("/w/history/:title", (req, res) => {
  db.all(
    `SELECT * FROM history WHERE target='${req.params.title}'`,
    (err, data) => {
      res.render(__dirname + "/interface/history", {
        title: req.params.title,
        data: data.reverse(),
      });
    }
  );
});

app.get("/w/legacy/:title", (req, res) => {
  if (!req.params.title || !Number(req.query.q)) {
    res.status(500).send("잘못된 요청입니다.");
    return;
  }
  db.all(
    `SELECT * FROM history WHERE target='${req.params.title}' AND rev=${req.query.q};`,
    (err, data) => {
      res.render(__dirname + "/interface/view", {
        title: req.params.title,
        editText: "편집",
        content: `<div style="padding: 10px; text-align: center; background-color: orange;">[주의!] 문서의 이전 버전(r${req.query.q} 판)을 보고 있습니다. <a href="/w/${req.params.title}">최신 버전으로 이동</a></div>${data[0]?.content}`,
      });
    }
  );
});

app.get("/s/edit/rec-rev", (req, res) => {
  db.all(
    `SELECT * FROM history WHERE target='${req.query.title}' AND rev=${req.query.q}`,
    (err, data) => {
      db.all(
        `UPDATE documents SET content='${data[0].content}' WHERE title='${req.query.title}'`
      );
      db.all(
        `SELECT * FROM history WHERE target='${req.query.title}'`,
        (err, data) => {
          db.all(
            `INSERT INTO history VALUES (${data.reverse()[0].rev + 1}, '${
              req.query.title
            }', '${new Date()}', '${req.ip}', 'recover to r${req.query.q}', '${
              req.query.sum
            }', '${data.reverse()[0].content}')`
          );
        }
      );
    }
  );
  res.send(
    `<script>alert('선택하신 리비전으로 복구했습니다.'); location.href = '/w/${req.query.title}'</script>`
  );
});

app.get("/s/delete/:title", (req, res) => {
  if (req.query.title === "대문" && !req.ip === "127.0.0.1") {
    res.send(
      `<script>alert('보호된 문서라 삭제할 수 없습니다.'); location.href = '/w/${req.params.title}'</script>`
    );
  } else {
    db.all(`DELETE FROM documents WHERE title='${req.params.title}'`);
    res.send(
      `<script>alert('문서를 삭제했습니다.'); location.href = '/w/${req.params.title}'</script>`
    );
    db.all(
      `SELECT * FROM history WHERE target='${req.params.title}'`,
      (err, data) => {
        console.log(data);
        db.all(
          `INSERT INTO history VALUES (${data.reverse()[0].rev + 1}, '${
            req.params.title
          }', '${new Date()}', '${req.ip}', 'delete', '${
            req.query.sum
          }', '<i>deleted document</i>')`
        );
      }
    );
  }
});

// ===== 404 핸들링 =====

app.get("/i/not-found", (req, res) => {
  res.sendFile(__dirname + "/interface/images/not-found.png");
});

app.use((req, res) => {
  res.status(404).sendFile(__dirname + "/interface/not-found.html");
});

// ===== 404 핸들링 =====

app.listen(80, "0.0.0.0", () => {
  console.log("서버를 실행했습니다.");
});
