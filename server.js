const express = require("express");
const sqlite3 = require("sqlite3");
const app = express();
const db = new sqlite3.Database("./database/db");

app.set("view engine", "ejs");

const renderView = (res, template, data) => {
  res.render(__dirname + template, data);
};

const handleNotFound = (req, res) => {
  res.status(404).sendFile(__dirname + "/interface/not-found.html");
};

const handleProtectedDocument = (res, title) => {
  res.send(
    `<script>alert('보호된 문서라 편집할 수 없습니다.'); location.href = '/w/${title}'</script>`
  );
};

const handleDocumentDeletion = (res, title) => {
  res.send(
    `<script>alert('문서를 삭제했습니다.'); location.href = '/w/${title}'</script>`
  );
};

app.get("/", (req, res) => {
  res.redirect("/w/대문");
});

app.get("/s/search", (req, res) => {
  const queryString = `SELECT * FROM documents WHERE title LIKE '%${req.query.q}%' OR content LIKE '%${req.query.q}%';`;
  db.all(queryString, (err, data) => {
    renderView(res, "/interface/search", { data, q: req.query.q });
  });
});

app.get("/w/:title", (req, res) => {
  const queryString = `SELECT * FROM documents WHERE title='${req.params.title}'`;
  db.all(queryString, (err, data) => {
    const title = data[0]?.title || req.params.title;
    const content = data[0]?.content || "문서가 없습니다.";
    const editText = data[0]?.title ? "편집" : "생성";
    renderView(res, "/interface/view", { title, content, editText });
  });
});

app.get("/w/edit/:title", (req, res) => {
  const queryString = `SELECT * FROM documents WHERE title='${req.params.title}'`;
  db.all(queryString, (err, data) => {
    const title = data[0]?.title || req.params.title;
    const content = data[0]?.content || "";
    const method = data[0]?.title ? "edit" : "create";
    renderView(res, "/interface/edit", { title, content, method });
  });
});

app.get("/s/edit/commit/", (req, res) => {
  const title = req.query.title;
  const queryString = `UPDATE documents SET content=${req.query.q} WHERE title='${title}'`;

  if (title === "대문" && req.ip !== "127.0.0.1") {
    handleProtectedDocument(res, title);
  } else {
    db.all(queryString);
    db.all(`SELECT * FROM history WHERE target='${title}'`, (err, data) => {
      const latestRev = data.reverse()[0]?.rev + 1 || 1;
      const currentDate = new Date();
      db.all(
        `INSERT INTO history VALUES (${latestRev}, '${title}', '${currentDate}', '${req.ip}', 'edit', '${req.query.sum}', ${req.query.q})`
      );
    });
    res.send(
      `<script>alert('편집했습니다.'); location.href = '/w/${title}'</script>`
    );
  }
});

app.get("/s/edit/create/", (req, res) => {
  const title = req.query.title;
  db.all(`INSERT INTO documents VALUES ('${title}', ${req.query.q})`);

  db.all(`SELECT * FROM history WHERE target='${title}'`, (err, data) => {
    const latestRev = data.reverse()[0]?.rev + 1 || 1;
    const currentDate = new Date();
    db.all(
      `INSERT INTO history VALUES (${latestRev}, '${title}', '${currentDate}', '${req.ip}', 'create', '${req.query.sum}', ${req.query.q})`
    );
  });

  res.send(
    `<script>alert('편집했습니다.'); location.href = '/w/${title}'</script>`
  );
});

app.get("/w/history/:title", (req, res) => {
  const queryString = `SELECT * FROM history WHERE target='${req.params.title}'`;
  db.all(queryString, (err, data) => {
    renderView(res, "/interface/history", {
      title: req.params.title,
      data: data.reverse(),
    });
  });
});

app.get("/w/legacy/:title", (req, res) => {
  const title = req.params.title;
  const rev = req.query.q;

  if (!title || !Number(rev)) {
    res.status(500).send("잘못된 요청입니다.");
    return;
  }

  const queryString = `SELECT * FROM history WHERE target='${title}' AND rev=${rev};`;
  db.all(queryString, (err, data) => {
    const content = data[0]?.content || "";
    renderView(res, "/interface/view", {
      title,
      editText: "편집",
      content: `<div style="padding: 10px; text-align: center; background-color: orange;">[주의!] 문서의 이전 버전(r${rev} 판)을 보고 있습니다. <a href="/w/${title}">최신 버전으로 이동</a></div>${content}`,
    });
  });
});

app.get("/s/edit/rec-rev", (req, res) => {
  const title = req.query.title;
  const rev = req.query.q;

  db.all(
    `SELECT * FROM history WHERE target='${title}' AND rev=${rev}`,
    (err, data) => {
      const content = data[0]?.content || "";
      db.all(
        `UPDATE documents SET content='${content}' WHERE title='${title}'`
      );
      db.all(
        `SELECT * FROM history WHERE target='${title}'`,
        (err, historyData) => {
          const latestRev = historyData.reverse()[0]?.rev + 1 || 1;
          const currentDate = new Date();
          db.all(
            `INSERT INTO history VALUES (${latestRev}, '${title}', '${currentDate}', '${req.ip}', 'recover to r${rev}', '${req.query.sum}', '${content}')`
          );
        }
      );
    }
  );

  res.send(
    `<script>alert('선택하신 리비전으로 복구했습니다.'); location.href = '/w/${title}'</script>`
  );
});

app.get("/s/delete/:title", (req, res) => {
  const title = req.params.title;

  if (title === "대문" && req.ip !== "127.0.0.1") {
    handleProtectedDocument(res, title);
  } else {
    db.all(
      `UPDATE documents SET content='문서가 없습니다' WHERE title='${title}'`
    );
    handleDocumentDeletion(res, title);
    db.all(`SELECT * FROM history WHERE target='${title}'`, (err, data) => {
      const latestRev = data.reverse()[0]?.rev + 1 || 1;
      const currentDate = new Date();
      db.all(
        `INSERT INTO history VALUES (${latestRev}, '${title}', '${currentDate}', '${req.ip}', 'delete', '${req.query.sum}', '<i>deleted document</i>')`
      );
    });
  }
});

// ===== 404 핸들링 =====

app.get("/i/not-found", (req, res) => {
  res.sendFile(__dirname + "/interface/images/not-found.png");
});

app.use((req, res) => {
  handleNotFound(req, res);
});

// ===== 404 핸들링 =====

app.listen(80, "0.0.0.0", () => {
  console.log("서버를 실행했습니다.");
});
