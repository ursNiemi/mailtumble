
/* global describe, it */

var assert = require("assert");
var fs = require("fs");
var index = require("../receive");

describe('receive.js', function() {
  describe('#processHeaders()', function() {
    it('should process email data and make updates', function(done) {
      var data = {
        config: {},
        email: {
          source: "betsy@example.com"
        },
        emailData: fs.readFileSync("test/assets/message.txt").toString(),
        log: console.log,
        recipients: ["jim@example.com"],
        originalRecipient: "info@example.com"
      };
      var emailDataProcessed = fs.readFileSync(
        "test/assets/message.processed.txt").toString();
      index.processHeaders(data)
        .then(function(data) {
          assert.equal(data.emailData,
            emailDataProcessed,
            "processEmail updated email data");
          done();
        }).catch(done);
    });

    it('should preserve an existing Reply-To header in emails', function(done) {
      var data = {
        config: {},
        email: {
          source: "betsy@example.com"
        },
        emailData:
          fs.readFileSync("test/assets/message.replyto.txt").toString(),
        log: console.log,
        recipients: ["jim@example.com"],
        originalRecipient: "info@example.com"
      };
      var emailDataProcessed = fs.readFileSync(
        "test/assets/message.processed.txt").toString();
      index.processHeaders(data)
        .then(function(data) {
          assert.equal(data.emailData,
            emailDataProcessed,
            "processEmail updated email data");
          done();
        }).catch(done);
    });

    it('should preserve an existing Reply-to header', function(done) {
      var data = {
        config: {},
        email: {
          source: "betsy@example.com"
        },
        emailData:
          fs.readFileSync("test/assets/message.replyto_case.txt").toString(),
        log: console.log,
        recipients: ["jim@example.com"],
        originalRecipient: "info@example.com"
      };
      var emailDataProcessed = fs.readFileSync(
        "test/assets/message.replyto_case.processed.txt").toString();
      index.processHeaders(data)
        .then(function(data) {
          assert.equal(data.emailData,
            emailDataProcessed,
            "processEmail updated email data");
          done();
        }).catch(done);
    });

    it('should allow overriding the From header in emails', function(done) {
      process.env.FROM_EMAIL = 'noreply@example.com';

      var data = {
        email: {
          source: "betsy@example.com"
        },
        emailData:
          fs.readFileSync("test/assets/message.txt").toString(),
        log: console.log,
        recipients: ["jim@example.com"],
        originalRecipient: "info@example.com"
      };
      var emailDataProcessed = fs.readFileSync(
        "test/assets/message.fromemail.txt").toString();
      index.processHeaders(data)
        .then(function(data) {
          assert.equal(data.emailData,
            emailDataProcessed,
            "processEmail updated email data");
          process.env.FROM_EMAIL = undefined;
          done();
        }).catch(done);
    });

    it('should process multiline From header in emails', function(done) {
      process.env.FROM_EMAIL = 'noreply@example.com';

      var data = {
        email: {
          source: "betsy@example.com"
        },
        emailData:
          fs.readFileSync("test/assets/message.from_multiline.source.txt").toString(),
        log: console.log,
        recipients: ["jim@example.com"],
        originalRecipient: "info@example.com"
      };
      var emailDataProcessed = fs.readFileSync(
        "test/assets/message.from_multiline.processed.txt").toString();
      index.processHeaders(data)
        .then(function(data) {
          assert.equal(data.emailData,
            emailDataProcessed,
            "processEmail updated email data");
          process.env.FROM_EMAIL = undefined;
          done();
        }).catch(done);
    });
  });
});
