(ns metabase.driver.mysql-test
  (:require [clj-time.core :as t]
            [clojure.java.jdbc :as jdbc]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [sync :as sync]
             [util :as u]]
            [metabase.driver.mysql :as mysql]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :refer [expect-with-driver]]
             [interface :as tx]]
            [metabase.test.util.timezone :as tu.tz]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; MySQL allows 0000-00-00 dates, but JDBC does not; make sure that MySQL is converting them to NULL when returning
;; them like we asked
(expect-with-driver :mysql
  [[1 nil]]
  (let [spec (sql-jdbc.conn/connection-details->spec :mysql (tx/dbdef->connection-details :mysql :server nil))]
    (try
      ;; Create the DB
      (doseq [sql ["DROP DATABASE IF EXISTS all_zero_dates;"
                   "CREATE DATABASE all_zero_dates;"]]
        (jdbc/execute! spec [sql]))
      ;; Create Table & add data
      (let [details (tx/dbdef->connection-details :mysql :db {:database-name "all_zero_dates"})
            spec    (-> (sql-jdbc.conn/connection-details->spec :mysql details)
                        ;; allow inserting dates where value is '0000-00-00' -- this is disallowed by default on newer
                        ;; versions of MySQL, but we still want to test that we can handle it correctly for older ones
                        (assoc :sessionVariables "sql_mode='ALLOW_INVALID_DATES'"))]
        (doseq [sql ["CREATE TABLE `exciting-moments-in-history` (`id` integer, `moment` timestamp);"
                     "INSERT INTO `exciting-moments-in-history` (`id`, `moment`) VALUES (1, '0000-00-00');"]]
          (jdbc/execute! spec [sql]))
        ;; create & sync MB DB
        (tt/with-temp Database [database {:engine "mysql", :details details}]
          (sync/sync-database! database)
          (data/with-db database
            ;; run the query
            (qp.test/rows
             (data/run-mbql-query exciting-moments-in-history))))))))


;; Test how TINYINT(1) columns are interpreted. By default, they should be interpreted as integers, but with the
;; correct additional options, we should be able to change that -- see
;; https://github.com/metabase/metabase/issues/3506
(tx/defdataset ^:private tiny-int-ones
  [["number-of-cans"
     [{:field-name "thing",          :base-type :type/Text}
      {:field-name "number-of-cans", :base-type {:native "tinyint(1)"}}]
     [["Six Pack"              6]
      ["Toucan"                2]
      ["Empty Vending Machine" 0]]]])

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/get-id db))]
    (set (map (partial into {}) (db/select [Field :name :base_type :special_type] :table_id [:in table-ids])))))

;; By default TINYINT(1) should be a boolean
(expect-with-driver :mysql
  #{{:name "number-of-cans", :base_type :type/Boolean, :special_type :type/Category}
    {:name "id",             :base_type :type/Integer, :special_type :type/PK}
    {:name "thing",          :base_type :type/Text,    :special_type :type/Category}}
  (data/with-db-for-dataset [db tiny-int-ones]
    (db->fields db)))

;; if someone says specifies `tinyInt1isBit=false`, it should come back as a number instead
(expect-with-driver :mysql
  #{{:name "number-of-cans", :base_type :type/Integer, :special_type :type/Quantity}
    {:name "id",             :base_type :type/Integer, :special_type :type/PK}
    {:name "thing",          :base_type :type/Text,    :special_type :type/Category}}
  (data/with-db-for-dataset [db tiny-int-ones]
    (tt/with-temp Database [db {:engine "mysql"
                                :details (assoc (:details db)
                                           :additional-options "tinyInt1isBit=false")}]
      (sync/sync-database! db)
      (db->fields db))))

(expect-with-driver :mysql
  "UTC"
  (tu/db-timezone-id))

(expect-with-driver :mysql
  "-02:00"
  (with-redefs [driver/execute-query (constantly {:rows [["2018-01-09 18:39:08.000000 -02"]]})]
    (tu/db-timezone-id)))

(expect-with-driver :mysql
  "Europe/Paris"
  (with-redefs [driver/execute-query (constantly {:rows [["2018-01-08 23:00:00.008 CET"]]})]
    (tu/db-timezone-id)))


(def ^:private before-daylight-savings (du/str->date-time "2018-03-10 10:00:00" du/utc))
(def ^:private after-daylight-savings  (du/str->date-time "2018-03-12 10:00:00" du/utc))

(expect (#'mysql/timezone-id->offset-str "US/Pacific" before-daylight-savings) "-08:00")
(expect (#'mysql/timezone-id->offset-str "US/Pacific" after-daylight-savings)  "-07:00")

(expect (#'mysql/timezone-id->offset-str "UTC" before-daylight-savings) "+00:00")
(expect (#'mysql/timezone-id->offset-str "UTC" after-daylight-savings) "+00:00")

(expect (#'mysql/timezone-id->offset-str "America/Los_Angeles" before-daylight-savings) "-08:00")
(expect (#'mysql/timezone-id->offset-str "America/Los_Angeles" after-daylight-savings) "-07:00")

;; make sure DateTime types generate appropriate SQL...
;; ...with no report-timezone set
(expect
  ["?" (du/->Timestamp #inst "2018-01-03")]
  (tu/with-temporary-setting-values [report-timezone nil]
    (hsql/format (sql.qp/->honeysql :mysql (du/->Timestamp #inst "2018-01-03")))))

;; ...with a report-timezone set
(expect
  ["convert_tz('2018-01-03T00:00:00.000', '+00:00', '-08:00')"]
  (tu/with-temporary-setting-values [report-timezone "US/Pacific"]
    (hsql/format (sql.qp/->honeysql :mysql (du/->Timestamp #inst "2018-01-03")))))

;; ...with a report-timezone set to the same as the system timezone (shouldn't need to do TZ conversion)
(expect
  ["?" (du/->Timestamp #inst "2018-01-03")]
  (tu/with-temporary-setting-values [report-timezone "UTC"]
    (hsql/format (sql.qp/->honeysql :mysql (du/->Timestamp #inst "2018-01-03")))))

;; Most of our tests either deal in UTC (offset 00:00) or America/Los_Angeles timezones (-07:00/-08:00). When dealing
;; with dates, we will often truncate the timestamp to a date. When we only test with negative timezone offsets, in
;; combination with this truncation, means we could have a bug and it's hidden by this negative-only offset. As an
;; example, if we have a datetime like 2018-08-17 00:00:00-08:00, converting to UTC this becomes 2018-08-17
;; 08:00:00+00:00, which when truncated is still 2018-08-17. That same scenario in Hong Kong is 2018-08-17
;; 00:00:00+08:00, which then becomes 2018-08-16 16:00:00+00:00 when converted to UTC, which will truncate to
;; 2018-08-16, instead of 2018-08-17
;;
;; This test ensures if our JVM timezone and reporting timezone are Asia/Hong_Kong, we get a correctly formatted date
(expect-with-driver :mysql
  ["2018-04-18T00:00:00.000+08:00"]
  (tu.tz/with-jvm-tz (t/time-zone-for-id "Asia/Hong_Kong")
    (tu/with-temporary-setting-values [report-timezone "Asia/Hong_Kong"]
      (qp.test/first-row
       (du/with-effective-timezone (data/db)
         (qp/process-query
           {:database   (data/id)
            :type       :native
            :settings   {:report-timezone "UTC"}
            :native     {:query         "SELECT cast({{date}} as date)"
                         :template-tags {:date {:name "date" :display_name "Date" :type "date" }}}
            :parameters [{:type "date/single" :target ["variable" ["template-tag" "date"]] :value "2018-04-18"}]}))))))

;; This tests a similar scenario, but one in which the JVM timezone is in Hong Kong, but the report timezone is in Los
;; Angeles. The Joda Time date parsing functions for the most part default to UTC. Our tests all run with a UTC JVM
;; timezone. This test catches a bug where we are incorrectly assuming a date is in UTC when the JVM timezone is
;; different.
;;
;; The original bug can be found here: https://github.com/metabase/metabase/issues/8262. The MySQL driver code was
;; parsing the date using JodateTime's date parser, which is in UTC. The MySQL driver code was assuming that date was
;; in the system timezone rather than UTC which caused an incorrect conversion and with the trucation, let to it being
;; off by a day
(expect-with-driver :mysql
  ["2018-04-18T00:00:00.000-07:00"]
  (tu.tz/with-jvm-tz (t/time-zone-for-id "Asia/Hong_Kong")
    (tu/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
      (qp.test/first-row
       (du/with-effective-timezone (data/db)
         (qp/process-query
           {:database   (data/id)
            :type       :native
            :settings   {:report-timezone "UTC"}
            :native     {:query         "SELECT cast({{date}} as date)"
                         :template-tags {:date {:name "date" :display_name "Date" :type "date" }}}
            :parameters [{:type "date/single" :target ["variable" ["template-tag" "date"]] :value "2018-04-18"}]}))))))

(def ^:private sample-connection-details
  {:db "my_db", :host "localhost", :port "3306", :user "cam", :password "bad-password"})

(def ^:private sample-jdbc-spec
  {:password             "bad-password"
   :characterSetResults  "UTF8"
   :characterEncoding    "UTF8"
   :classname            "org.mariadb.jdbc.Driver"
   :subprotocol          "mysql"
   :zeroDateTimeBehavior "convertToNull"
   :user                 "cam"
   :subname              "//localhost:3306/my_db"
   :useCompression       true
   :useUnicode           true})

;; Do `:ssl` connection details give us the connection spec we'd expect?
(expect
  (assoc sample-jdbc-spec :useSSL true)
  (sql-jdbc.conn/connection-details->spec :mysql (assoc sample-connection-details :ssl true)))

;; what about non-SSL connections?
(expect
  (assoc sample-jdbc-spec :useSSL false)
  (sql-jdbc.conn/connection-details->spec :mysql sample-connection-details))

;; Connections that are `:ssl false` but with `useSSL` in the additional options should be treated as SSL (see #9629)
(expect
  (assoc sample-jdbc-spec :useSSL true, :subname "//localhost:3306/my_db?useSSL=true&trustServerCertificate=true")
  (sql-jdbc.conn/connection-details->spec :mysql
    (assoc sample-connection-details :ssl false, :additional-options "useSSL=true&trustServerCertificate=true")))
