// HACK: needed due to cyclical dependency issue
import "metabase-lib/lib/Question";

import {
    metadata,
    question,
    DATABASE_ID,
    ANOTHER_DATABASE_ID,
    ORDERS_TABLE_ID,
    PRODUCT_TABLE_ID,
    ORDERS_TOTAL_FIELD_ID,
    MAIN_METRIC_ID,
    ORDERS_PRODUCT_FK_FIELD_ID,
    PRODUCT_TILE_FIELD_ID,
    ORDERS_PK_FIELD_ID
} from "metabase/__support__/sample_dataset_fixture";

import StructuredQuery from "./StructuredQuery";

function makeDatasetQuery(query) {
    return {
        type: "query",
        database: DATABASE_ID,
        query: {
            source_table: ORDERS_TABLE_ID,
            ...query
        }
    };
}

function makeQuery(query) {
    return new StructuredQuery(question, makeDatasetQuery(query));
}

function makeQueryWithAggregation(agg) {
    return makeQuery({ aggregation: [agg] });
}

const query = makeQuery({});

describe("StructuredQuery behavioral tests", () => {
    it("is able to filter by field which is already used for the query breakout", () => {
         const breakoutDimensionOptions = query.breakoutOptions().dimensions;
         const breakoutDimension = breakoutDimensionOptions.find((d) => d.field().id === ORDERS_TOTAL_FIELD_ID);

         expect(breakoutDimension).toBeDefined();

         const queryWithBreakout = query.addBreakout(breakoutDimension.mbql());

         const filterDimensionOptions = queryWithBreakout.filterFieldOptions().dimensions;
         const filterDimension = filterDimensionOptions.find((d) => d.field().id === ORDERS_TOTAL_FIELD_ID);

         expect(filterDimension).toBeDefined();
    });
});

describe("StructuredQuery unit tests", () => {
    describe("DB METADATA METHODS", () => {
        describe("tables", () => {
            it("Tables should return multiple tables", () => {
                expect(Array.isArray(query.tables())).toBe(true);
            });
            it("Tables should return a table map that includes fields", () => {
                expect(Array.isArray(query.tables()[0].fields)).toBe(true);
            });
        });
        describe("table", () => {
            it("Return the table wrapper object for the query", () => {
                expect(query.table()).toBe(metadata.tables[ORDERS_TABLE_ID]);
            });
        });
        describe("databaseId", () => {
            it("returns the Database ID of the wrapped query ", () => {
                expect(query.databaseId()).toBe(DATABASE_ID);
            });
        });
        describe("database", () => {
            it("returns a dictionary with the underlying database of the wrapped query", () => {
                expect(query.database().id).toBe(DATABASE_ID);
            });
        });
        describe("isEmpty", () => {
            it("tells that a non-empty query is not empty", () => {
                expect(query.isEmpty()).toBe(false);
            });
        });
        describe("engine", () => {
            it("identifies the engine of a query", () => {
                // This is a magic constant and we should probably pull this up into an enum
                expect(query.engine()).toBe("h2");
            });
        });
    })

    describe("SIMPLE QUERY MANIPULATION METHODS", () => {
        describe("reset", () => {
            it("Expect a reset query to not have a selected database", () => {
                expect(query.reset().database()).toBe(null);
            });
            it("Expect a reset query to not be runnable", () => {
                expect(query.reset().canRun()).toBe(false);
            });
        });
        describe("query", () => {
            it("returns the wrapper for the query dictionary", () => {
                expect(query.query().source_table).toBe(ORDERS_TABLE_ID);
            });
        });
        describe("setDatabase", () => {
            it("allows you to set a new database", () => {
                expect(
                    query
                        .setDatabase(metadata.databases[ANOTHER_DATABASE_ID])
                        .database().id
                ).toBe(ANOTHER_DATABASE_ID);
            });
        });
        describe("setTable", () => {
            it("allows you to set a new table", () => {
                expect(
                    query.setTable(metadata.tables[PRODUCT_TABLE_ID]).tableId()
                ).toBe(PRODUCT_TABLE_ID);
            });

            it("retains the correct database id when setting a new table", () => {
                expect(
                    query
                        .setTable(metadata.tables[PRODUCT_TABLE_ID])
                        .table().database.id
                ).toBe(DATABASE_ID);
            });
        });
        describe("tableId", () => {
            it("Return the right table id", () => {
                expect(query.tableId()).toBe(ORDERS_TABLE_ID);
            });
        });
    })

    describe("QUERY STATUS METHODS", () => {
        describe("canRun", () => {
            it("runs a valid query", () => {
                expect(query.canRun()).toBe(true);
            });
        });
        describe("isEditable", () => {
            it("A valid query should be editable", () => {
                expect(query.isEditable()).toBe(true);
            });
        });
    })

    describe("AGGREGATION METHODS", () => {
        describe("aggregations", () => {
            it("should return an empty list for an empty query", () => {
                expect(query.aggregations().length).toBe(0);
            });
            it("should return a list of one item after adding an aggregation", () => {
                expect(query.addAggregation(["count"]).aggregations().length).toBe(
                    1
                );
            });
            it("should return an actual count aggregation after trying to add it", () => {
                expect(query.addAggregation(["count"]).aggregations()[0]).toEqual([
                    "count"
                ]);
            });
        });
        describe("aggregationsWrapped", () => {
            it("should return an empty list for an empty query", () => {
                expect(query.aggregationsWrapped().length).toBe(0);
            });
            it("should return a list with Aggregation after adding an aggregation", () => {
                expect(
                    query
                        .addAggregation(["count"])
                        .aggregationsWrapped()[0]
                        .isValid()
                ).toBe(true);
            });
        });

        describe("aggregationOptions", () => {
            // TODO Atte Keinänen 6/14/17: Add the mock metadata for aggregation options
            xit("should return a non-empty list of options", () => {
                expect(query.aggregationOptions().length).toBeGreaterThan(0);
            });
            xit("should contain the count aggregation", () => {
            });
        });
        describe("aggregationOptionsWithoutRaw", () => {
            it("", () => {
            });
        });

        describe("aggregationFieldOptions()", () => {
            it("", () => {
            });
        });

        describe("canRemoveAggregation", () => {
            it("returns false if there are no aggregations", () => {
                expect(query.canRemoveAggregation()).toBe(false);
            });
            it("returns false for a single aggregation", () => {
                expect(query.addAggregation(["count"]).canRemoveAggregation()).toBe(
                    false
                );
            });
            it("returns true for two aggregations", () => {
                expect(
                    query
                        .addAggregation(["count"])
                        .addAggregation([
                            "sum",
                            ["field-id", ORDERS_TOTAL_FIELD_ID]
                        ])
                        .canRemoveAggregation()
                ).toBe(true);
            });
        });

        describe("isBareRows", () => {
            it("is true for an empty query", () => {
                expect(query.isBareRows()).toBe(true);
            });
            it("is false for a count aggregation", () => {
                expect(query.addAggregation(["count"]).isBareRows()).toBe(false);
            });
        });

        describe("aggregationName", () => {
            it("returns a saved metric's name", () => {
                expect(
                    makeQueryWithAggregation([
                        "METRIC",
                        MAIN_METRIC_ID
                    ]).aggregationName()
                ).toBe("Total Order Value");
            });
            it("returns a standard aggregation name", () => {
                expect(makeQueryWithAggregation(["count"]).aggregationName()).toBe(
                    "Count of rows"
                );
            });
            it("returns a standard aggregation name with field", () => {
                expect(
                    makeQueryWithAggregation([
                        "sum",
                        ["field-id", ORDERS_TOTAL_FIELD_ID]
                    ]).aggregationName()
                ).toBe("Sum of Total");
            });
            it("returns a standard aggregation name with fk field", () => {
                expect(
                    makeQueryWithAggregation([
                        "sum",
                        ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_TILE_FIELD_ID]
                    ]).aggregationName()
                ).toBe("Sum of Title");
            });
            it("returns a custom expression description", () => {
                expect(
                    makeQueryWithAggregation([
                        "+",
                        1,
                        ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]]
                    ]).aggregationName()
                ).toBe("1 + Sum(Total)");
            });
            it("returns a named expression name", () => {
                expect(
                    makeQueryWithAggregation([
                        "named",
                        ["sum", ["field-id", ORDERS_TOTAL_FIELD_ID]],
                        "Named"
                    ]).aggregationName()
                ).toBe("Named");
            });
        });

        describe("addAggregation", () => {
            it("adds an aggregation", () => {
                expect(query.addAggregation(["count"]).query()).toEqual({
                    source_table: ORDERS_TABLE_ID,
                    aggregation: [["count"]]
                });
            });
        });

        describe("removeAggregation", () => {
            it("removes the correct aggregation", () => {
            });
            it("removes all breakouts when removing the last aggregation", () => {
            });
        });

        describe("updateAggregation", () => {
            it("updates the correct aggregation", () => {
            });
            it('removes all breakouts and aggregations when setting an aggregation to "rows"', () => {
            });
        });

        describe("clearAggregations", () => {
            it("clears all aggreagtions and breakouts", () => {
            });
        });
    });

    // BREAKOUTS:
    describe("BREAKOUT METHODS", () => {
        describe("breakouts", () => {
            it("", () => {
            });
        });
        describe("breakoutOptions", () => {
            it("returns the correct count of dimensions", () => {
                expect(query.breakoutOptions().dimensions.length).toBe(5)
            });

            it("excludes the already used breakouts", () => {
                const queryWithBreakout = query.addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID]);
                expect(queryWithBreakout.breakoutOptions().dimensions.length).toBe(4)
            });

            it("includes an explicitly provided breakout although it has already been used", () => {
                const breakout = ["field-id", ORDERS_TOTAL_FIELD_ID]
                const queryWithBreakout = query.addBreakout(breakout);
                expect(queryWithBreakout.breakoutOptions().dimensions.length).toBe(4)
                expect(queryWithBreakout.breakoutOptions(breakout).dimensions.length).toBe(5)
            });
        });
        describe("canAddBreakout", () => {
            it("", () => {
            });
        });
        describe("hasValidBreakout", () => {
            it("", () => {
            });
        });

        describe("addBreakout", () => {
            it("adds a breakout", () => {
            });
        });

        describe("removeBreakout", () => {
            it("removes the correct breakout", () => {
            });
        });

        describe("updateBreakout", () => {
            it("updates the correct breakout", () => {
            });
        });

        describe("clearBreakouts", () => {
            it("clears all breakouts", () => {
            });
        });
    })

    // FILTERS:
    describe("FILTER METHODS", () => {
        describe("filters", () => {
            it("", () => {
            });
        });

        describe("filterFieldOptions", () => {
            it("", () => {
            });
        });
        describe("filterSegmentOptions", () => {
            it("", () => {
            });
        });

        describe("canAddFilter", () => {
            it("", () => {
            });
        });

        describe("addFilter", () => {
            it("adds an filter", () => {
            });
        });
        describe("removeFilter", () => {
            it("removes the correct filter", () => {
            });
        });
        describe("updateFilter", () => {
            it("updates the correct filter", () => {
            });
        });
        describe("clearFilters", () => {
            it("clears all filters", () => {
            });
        });
    });

    describe("SORT METHODS", () => {
        describe("sorts", () => {
            it("return an empty array", () => {
                expect(query.sorts()).toEqual([]);
            });
            it("return an array with the sort clause", () => {
                expect(
                    makeQuery({
                        order_by: [["field-id", ORDERS_TOTAL_FIELD_ID], "ascending"]
                    }).sorts()
                ).toEqual([["field-id", ORDERS_TOTAL_FIELD_ID], "ascending"]);
            });
        });

        describe("sortOptions", () => {
            it("returns the correct count of dimensions", () => {
                expect(query.sortOptions().dimensions.length).toBe(5)
            });

            it("excludes the already used sorts", () => {
                const queryWithBreakout = query.addSort([["field-id", ORDERS_TOTAL_FIELD_ID], "ascending"]);
                expect(queryWithBreakout.sortOptions().dimensions.length).toBe(4)
            });

            it("includes an explicitly provided sort although it has already been used", () => {
                const sort = [["field-id", ORDERS_TOTAL_FIELD_ID], "ascending"];
                const queryWithBreakout = query.addSort(sort);
                expect(queryWithBreakout.sortOptions().dimensions.length).toBe(4)
                expect(queryWithBreakout.sortOptions(sort).dimensions.length).toBe(5)
            });
        });

        describe("canAddSort", () => {
            it("", () => {});
        });

        describe("addSort", () => {
            it("adds a sort", () => {});
        });
        describe("updateSort", () => {
            it("", () => {});
        });
        describe("removeSort", () => {
            it("removes the correct sort", () => {});
        });
        describe("clearSort", () => {
            it("clears all sorts", () => {});
        });
        describe("replaceSort", () => {
            it("replaces sorts with a new sort", () => {});
        });

    })
    // LIMIT

    describe("LIMIT METHODS", () => {
        describe("limit", () => {
            it("returns null if there is no limit", () => {});
            it("returns the limit if one has been set", () => {});
        });

        describe("updateLimit", () => {
            it("updates the limit", () => {});
        });
        describe("clearLimit", () => {
            it("clears the limit", () => {});
        });
    })

    describe("EXPRESSION METHODS", () => {
        describe("expressions", () => {
            it("returns an empty map", () => {});
            it("returns a map with the expressions", () => {});
        });
        describe("updateExpression", () => {
            it("updates the correct expression", () => {});
        });
        describe("removeExpression", () => {
            it("removes the correct expression", () => {});
        });
    })

    describe("DIMENSION METHODS", () => {
        describe("fieldOptions", () => {
            it("includes the correct number of dimensions", () => {
                // Should just include the non-fk keys from the current table
                expect(query.fieldOptions().dimensions.length).toBe(5);
            });
            it("does not include foreign key fields in the dimensions list", () => {
                const dimensions = query.fieldOptions().dimensions;
                const fkDimensions = dimensions.filter(dim => dim.field() && dim.field().isFK());
                expect(fkDimensions.length).toBe(0);
            });

            it("returns correct count of foreign keys", () => {
                expect(query.fieldOptions().fks.length).toBe(2);
            });
            it("returns a correct count of fields", () => {
                expect(query.fieldOptions().count).toBe(26);
            });
        });
        describe("dimensions", () => {
            it("", () => {});
        });
        describe("tableDimensions", () => {
            it("", () => {});
        });
        describe("expressionDimensions", () => {
            it("", () => {});
        });
        describe("aggregationDimensions", () => {
            it("", () => {});
        });
        describe("metricDimensions", () => {
            it("", () => {});
        });
    })

    describe("FIELD REFERENCE METHODS", () => {
        describe("fieldReferenceForColumn", () => {
            it("", () => {});
        });

        describe("parseFieldReference", () => {
            it("", () => {});
        });
    })


    describe("DATASET QUERY METHODS", () => {
        describe("setDatasetQuery", () => {
            it("replaces the previous dataset query with the provided one", () => {
                const newDatasetQuery = makeDatasetQuery({
                    source_table: ORDERS_TABLE_ID,
                    aggregation: [["count"]]
                });

                expect(query.setDatasetQuery(newDatasetQuery).datasetQuery()).toBe(
                    newDatasetQuery
                );
            });
        });
    })
});
