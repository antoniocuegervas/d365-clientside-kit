import { CdsClient, CdsClientError } from "../../../../shared/data/CdsClient";
import { FakeXhrServer } from "../../../mocks/FakeXhr";

describe("CdsClient", () => {
  let server: FakeXhrServer;

  const makeClient = (overrides?: { apiVersion?: string; maxUrlLength?: number }) =>
    new CdsClient({ clientUrl: "https://org.crm.dynamics.com/", ...overrides });

  beforeEach(() => {
    server = new FakeXhrServer();
    server.install();
  });

  afterEach(() => {
    server.uninstall();
  });

  describe("URL composition", () => {
    it("builds the API root from org URL + default version, trimming trailing slashes", () => {
      expect(makeClient().apiUrl).toBe("https://org.crm.dynamics.com/api/data/v9.2/");
    });

    it("honors an explicit legacy version (no hardcoded versions)", () => {
      expect(makeClient({ apiVersion: "8.2" }).apiUrl).toBe(
        "https://org.crm.dynamics.com/api/data/v8.2/"
      );
    });
  });

  describe("CRUD", () => {
    it("createRecord POSTs JSON and parses the OData-EntityId header", async () => {
      server.respondAlways({
        status: 204,
        headers: {
          "OData-EntityId":
            "https://org.crm.dynamics.com/api/data/v9.2/accounts({ABC00000-0000-0000-0000-000000000009})",
        },
      });
      const result = await makeClient().createRecord("accounts", { name: "Contoso" });
      expect(result.id).toBe("abc00000-0000-0000-0000-000000000009");
      const request = server.lastRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://org.crm.dynamics.com/api/data/v9.2/accounts");
      expect(request.body).toBe('{"name":"Contoso"}');
      expect(request.headers["Content-Type"]).toBe("application/json; charset=utf-8");
      expect(request.headers["OData-Version"]).toBe("4.0");
      expect(request.headers["OData-MaxVersion"]).toBe("4.0");
    });

    it("updateRecord PATCHes the record URL with a normalized guid", async () => {
      server.respondAlways({ status: 204 });
      await makeClient().updateRecord("accounts", "{ABC00000-0000-0000-0000-000000000009}", {
        name: "Renamed",
      });
      const request = server.lastRequest;
      expect(request.method).toBe("PATCH");
      expect(request.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/accounts(abc00000-0000-0000-0000-000000000009)"
      );
    });

    it("deleteRecord DELETEs the record URL", async () => {
      server.respondAlways({ status: 204 });
      await makeClient().deleteRecord("contacts", "abc00000-0000-0000-0000-000000000001");
      expect(server.lastRequest.method).toBe("DELETE");
      expect(server.lastRequest.url).toContain("contacts(abc00000-0000-0000-0000-000000000001)");
    });

    it("retrieveRecord GETs with query string, annotations Prefer header, ambient credentials", async () => {
      server.respondAlways({ status: 200, responseText: '{"name":"Contoso"}' });
      const record = await makeClient().retrieveRecord(
        "accounts",
        "abc00000-0000-0000-0000-000000000009",
        "?$select=name"
      );
      expect(record.name).toBe("Contoso");
      const request = server.lastRequest;
      expect(request.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/accounts(abc00000-0000-0000-0000-000000000009)?$select=name"
      );
      expect(request.headers["Prefer"]).toBe('odata.include-annotations="*"');
      expect(request.withCredentials).toBe(true);
    });

    it("retrieveMultiple parses entities and nextLink", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          value: [{ name: "A" }, { name: "B" }],
          "@odata.nextLink": "https://org.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=x",
        }),
      });
      const result = await makeClient().retrieveMultiple("accounts", "?$select=name");
      expect(result.entities).toHaveLength(2);
      expect(result.nextLink).toContain("$skiptoken=x");
    });

    it("retrieveMultiple requests server-side paging via the odata.maxpagesize Prefer", async () => {
      server.respondAlways({ status: 200, responseText: JSON.stringify({ value: [] }) });
      await makeClient().retrieveMultiple("accounts", "?$select=name", 10);
      const prefer = server.lastRequest.headers["Prefer"];
      // Combined into one Prefer value: annotations plus the page size.
      expect(prefer).toContain("odata.maxpagesize=10");
      expect(prefer).toContain('odata.include-annotations="*"');
      expect(server.lastRequest.url).not.toContain("$top");
    });

    it("retrieveMultipleByUrl re-sends the page size when following a nextLink", async () => {
      server.respondAlways({ status: 200, responseText: JSON.stringify({ value: [] }) });
      const nextLink = "https://org.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=x";
      await makeClient().retrieveMultipleByUrl(nextLink, 5);
      // The nextLink cookie does not carry the page size, so re-sending the
      // preference is what keeps page 2 the same size as page 1.
      expect(server.lastRequest.headers["Prefer"]).toContain("odata.maxpagesize=5");
      expect(server.lastRequest.url).toBe(nextLink);
    });

    it("surfaces FetchXML paging annotations (total, more-records, cookie)", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          value: [{ name: "A" }],
          "@Microsoft.Dynamics.CRM.totalrecordcount": 42,
          "@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded": false,
          "@Microsoft.Dynamics.CRM.morerecords": true,
          "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie": "<cookie/>",
        }),
      });
      const result = await makeClient().fetch("accounts", "<fetch><entity name='account'/></fetch>");
      expect(result.totalRecordCount).toBe(42);
      expect(result.totalRecordCountLimitExceeded).toBeFalsy();
      expect(result.moreRecords).toBe(true);
      expect(result.pagingCookie).toBe("<cookie/>");
    });

    it("flags an over-cap total and ignores the -1 sentinel", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          value: [],
          "@Microsoft.Dynamics.CRM.totalrecordcount": -1,
          "@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded": true,
        }),
      });
      const result = await makeClient().retrieveMultiple("accounts");
      expect(result.totalRecordCount).toBeUndefined();
      expect(result.totalRecordCountLimitExceeded).toBe(true);
    });
  });

  describe("FetchXML", () => {
    const shortFetch = "<fetch><entity name='account'/></fetch>";

    it("uses a GET with encoded fetchXml when the URL is short enough", async () => {
      server.respondAlways({ status: 200, responseText: '{"value":[]}' });
      await makeClient().fetch("accounts", shortFetch);
      const request = server.lastRequest;
      expect(request.method).toBe("GET");
      expect(request.url).toBe(
        `https://org.crm.dynamics.com/api/data/v9.2/accounts?fetchXml=${encodeURIComponent(shortFetch)}`
      );
    });

    it("falls back to $batch when the URL exceeds the limit", async () => {
      server.respondAlways({
        status: 200,
        responseText: [
          "--batchresponse_xyz",
          "Content-Type: application/http",
          "",
          "HTTP/1.1 200 OK",
          "Content-Type: application/json",
          "",
          '{"value":[{"name":"Batched"}]}',
          "--batchresponse_xyz--",
        ].join("\r\n"),
      });
      const longFetch = `<fetch><entity name='account'><filter>${"<condition attribute='name' operator='eq' value='x'/>".repeat(50)}</filter></entity></fetch>`;
      const result = await makeClient({ maxUrlLength: 500 }).fetch("accounts", longFetch);

      expect(result.entities).toEqual([{ name: "Batched" }]);
      const request = server.lastRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://org.crm.dynamics.com/api/data/v9.2/$batch");
      expect(request.headers["Content-Type"]).toMatch(/^multipart\/mixed;boundary=batch_/);

      const boundary = request.headers["Content-Type"].split("boundary=")[1];
      expect(request.body).toContain(`--${boundary}\r\n`);
      expect(request.body).toContain(`--${boundary}--`);
      expect(request.body).toContain("Content-Type: application/http");
      expect(request.body).toContain(
        `GET https://org.crm.dynamics.com/api/data/v9.2/accounts?fetchXml=${encodeURIComponent(longFetch)} HTTP/1.1`
      );
    });
  });

  describe("actions and workflows", () => {
    it("executes an unbound action with parameters", async () => {
      server.respondAlways({ status: 200, responseText: '{"Status":1}' });
      const result = await makeClient().executeAction("new_MyAction", { Input: "x" });
      expect(result).toEqual({ Status: 1 });
      expect(server.lastRequest.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/new_MyAction"
      );
      expect(server.lastRequest.body).toBe('{"Input":"x"}');
    });

    it("qualifies bound actions with the CRM namespace", async () => {
      server.respondAlways({ status: 204 });
      await makeClient().executeAction(
        "new_Approve",
        {},
        { entitySet: "opportunities", id: "{DEF00000-0000-0000-0000-000000000002}" }
      );
      expect(server.lastRequest.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/opportunities(def00000-0000-0000-0000-000000000002)/Microsoft.Dynamics.CRM.new_Approve"
      );
    });

    it("executeClassicWorkflow posts ExecuteWorkflow bound to the workflow record", async () => {
      server.respondAlways({ status: 200, responseText: "{}" });
      await makeClient().executeClassicWorkflow(
        "11100000-0000-0000-0000-000000000001",
        "{22200000-0000-0000-0000-000000000002}"
      );
      const request = server.lastRequest;
      expect(request.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/workflows(11100000-0000-0000-0000-000000000001)/Microsoft.Dynamics.CRM.ExecuteWorkflow"
      );
      expect(request.body).toBe('{"EntityId":"22200000-0000-0000-0000-000000000002"}');
    });
  });

  describe("execute (request-object contract)", () => {
    it("runs an unbound action: POST the operation with the parameter body", async () => {
      server.respondAlways({ status: 200, responseText: '{"Result":7}' });
      const response = await makeClient().execute({
        Amount: 5,
        getMetadata: () => ({ operationName: "new_Recalculate", operationType: 0, boundParameter: null }),
      });
      expect(response.ok).toBe(true);
      expect(await response.json()).toEqual({ Result: 7 });
      expect(server.lastRequest.method).toBe("POST");
      expect(server.lastRequest.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/new_Recalculate"
      );
      expect(server.lastRequest.body).toBe('{"Amount":5}');
    });

    it("runs a bound action: target the entity set and qualify the name, dropping the bound param", async () => {
      server.respondAlways({ status: 204 });
      await makeClient().execute({
        entity: { entityType: "opportunity", id: "{DEF00000-0000-0000-0000-000000000002}" },
        Reason: "Won",
        getMetadata: () => ({ operationName: "new_Close", operationType: 0, boundParameter: "entity" }),
      });
      expect(server.lastRequest.method).toBe("POST");
      expect(server.lastRequest.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/opportunities(def00000-0000-0000-0000-000000000002)/Microsoft.Dynamics.CRM.new_Close"
      );
      // The bound reference is not part of the POST body.
      expect(server.lastRequest.body).toBe('{"Reason":"Won"}');
    });

    it("runs an unbound function: GET with the OData parameter-alias syntax", async () => {
      server.respondAlways({ status: 200, responseText: '{"value":"Pacific"}' });
      await makeClient().execute({
        Name: "Contoso",
        Code: 1033,
        getMetadata: () => ({ operationName: "GetSomething", operationType: 1, boundParameter: null }),
      });
      expect(server.lastRequest.method).toBe("GET");
      expect(server.lastRequest.url).toBe(
        `https://org.crm.dynamics.com/api/data/v9.2/GetSomething(Name=@p1,Code=@p2)?@p1=${encodeURIComponent("'Contoso'")}&@p2=1033`
      );
    });

    it("escapes single quotes in a function's string parameter (OData literal rules)", async () => {
      server.respondAlways({ status: 200, responseText: '{"value":1}' });
      await makeClient().execute({
        Name: "O'Brien",
        getMetadata: () => ({ operationName: "GetSomething", operationType: 1, boundParameter: null }),
      });
      expect(server.lastRequest.url).toBe(
        `https://org.crm.dynamics.com/api/data/v9.2/GetSomething(Name=@p1)?@p1=${encodeURIComponent("'O''Brien'")}`
      );
    });

    it("rejects CRUD requests with a pointer to the dedicated methods", async () => {
      await expect(
        makeClient().execute({
          getMetadata: () => ({ operationName: "Create", operationType: 2 }),
        })
      ).rejects.toThrow(/use createRecord, updateRecord, deleteRecord/);
    });

    it("rejects a request with no operationName", async () => {
      await expect(
        makeClient().execute({ getMetadata: () => ({ operationType: 0 }) })
      ).rejects.toThrow(/requires operationName/);
    });

    it("resolves with ok=false on an HTTP error instead of throwing (fetch parity)", async () => {
      server.respondAlways({
        status: 400,
        responseText: JSON.stringify({ error: { message: "bad" } }),
      });
      const response = await makeClient().execute({
        getMetadata: () => ({ operationName: "new_Do", operationType: 0 }),
      });
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { message: "bad" } });
    });

    it("executeMultiple sends one $batch and maps each part to its own response", async () => {
      server.respondAlways({
        status: 200,
        responseText: [
          "--batchresponse_abc",
          "Content-Type: application/http",
          "",
          "HTTP/1.1 200 OK",
          "Content-Type: application/json",
          "",
          '{"value":"A-ok"}',
          "--batchresponse_abc",
          "Content-Type: application/http",
          "",
          "HTTP/1.1 400 Bad Request",
          "Content-Type: application/json",
          "",
          '{"error":{"message":"B failed"}}',
          "--batchresponse_abc--",
        ].join("\r\n"),
      });

      const responses = await makeClient().executeMultiple([
        { getMetadata: () => ({ operationName: "ActionA", operationType: 0 }) },
        { getMetadata: () => ({ operationName: "ActionB", operationType: 0 }) },
      ]);

      // One round-trip: a single $batch POST carrying both operations.
      expect(server.requests).toHaveLength(1);
      const request = server.lastRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://org.crm.dynamics.com/api/data/v9.2/$batch");
      expect(request.headers["Content-Type"]).toMatch(/^multipart\/mixed;boundary=batch_/);
      expect(request.body).toContain("POST https://org.crm.dynamics.com/api/data/v9.2/ActionA HTTP/1.1");
      expect(request.body).toContain("POST https://org.crm.dynamics.com/api/data/v9.2/ActionB HTTP/1.1");

      // Per-part outcomes, in request order: one ok, one failed, no throw.
      expect(responses).toHaveLength(2);
      expect(responses[0].ok).toBe(true);
      expect(responses[0].status).toBe(200);
      expect(await responses[0].json()).toEqual({ value: "A-ok" });
      expect(responses[1].ok).toBe(false);
      expect(responses[1].status).toBe(400);
      expect(await responses[1].json()).toEqual({ error: { message: "B failed" } });
    });

    it("executeMultiple short-circuits an empty request list", async () => {
      expect(await makeClient().executeMultiple([])).toEqual([]);
      expect(server.requests).toHaveLength(0);
    });
  });

  describe("executeChangeSet (transactional)", () => {
    it("emits one change set with content-id refs and returns created ids", async () => {
      // A successful change set comes back as a nested multipart with one part
      // per operation, each tagged by Content-ID; creates carry OData-EntityId.
      server.respondAlways({
        status: 200,
        responseText: [
          "--batchresponse_x",
          "Content-Type: multipart/mixed; boundary=changesetresponse_y",
          "",
          "--changesetresponse_y",
          "Content-Type: application/http",
          "Content-ID: 1",
          "",
          "HTTP/1.1 204 No Content",
          "OData-EntityId: https://org.crm.dynamics.com/api/data/v9.2/accounts(aaa00000-0000-0000-0000-000000000001)",
          "",
          "--changesetresponse_y",
          "Content-Type: application/http",
          "Content-ID: 2",
          "",
          "HTTP/1.1 204 No Content",
          "OData-EntityId: https://org.crm.dynamics.com/api/data/v9.2/contacts(bbb00000-0000-0000-0000-000000000002)",
          "",
          "--changesetresponse_y",
          "Content-Type: application/http",
          "Content-ID: 3",
          "",
          "HTTP/1.1 204 No Content",
          "",
          "--changesetresponse_y--",
          "--batchresponse_x--",
        ].join("\r\n"),
      });

      const results = await makeClient().executeChangeSet([
        { method: "POST", entityLogicalName: "account", data: { name: "Contoso" } },
        {
          method: "POST",
          entityLogicalName: "contact",
          data: { lastname: "Smith", "parentcustomerid_account@odata.bind": "$1" },
        },
        {
          method: "PATCH",
          entityLogicalName: "account",
          id: "$1",
          data: { "primarycontactid@odata.bind": "$2" },
        },
      ]);

      // One round-trip: a single $batch POST carrying one change set boundary.
      expect(server.requests).toHaveLength(1);
      const request = server.lastRequest;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://org.crm.dynamics.com/api/data/v9.2/$batch");
      expect(request.headers["Content-Type"]).toMatch(/^multipart\/mixed;boundary=batch_/);
      // A nested change-set boundary, each op carrying a 1-based Content-ID.
      expect(request.body).toMatch(/Content-Type: multipart\/mixed;boundary=changeset_/);
      expect(request.body).toContain("Content-ID: 1");
      expect(request.body).toContain("Content-ID: 2");
      expect(request.body).toContain("Content-ID: 3");
      // Create targets the entity set; the update references content-id 1 as "$1".
      expect(request.body).toContain("POST https://org.crm.dynamics.com/api/data/v9.2/accounts HTTP/1.1");
      expect(request.body).toContain("POST https://org.crm.dynamics.com/api/data/v9.2/contacts HTTP/1.1");
      expect(request.body).toContain("PATCH $1 HTTP/1.1");
      expect(request.body).toContain('"parentcustomerid_account@odata.bind":"$1"');

      // Created ids returned in request order; the update carries no id.
      expect(results).toEqual([
        { entityType: "account", id: "aaa00000-0000-0000-0000-000000000001" },
        { entityType: "contact", id: "bbb00000-0000-0000-0000-000000000002" },
        { entityType: "account", id: undefined },
      ]);
    });

    it("throws when the change set rolls back (non-2xx, unlike the flat batch)", async () => {
      // A failing change set returns a non-2xx status with the failing op's error,
      // so a single status check is the all-or-nothing signal.
      server.respondAlways({
        status: 400,
        responseText: JSON.stringify({ error: { message: "name is required" } }),
      });
      await expect(
        makeClient().executeChangeSet([
          { method: "POST", entityLogicalName: "account", data: {} },
        ])
      ).rejects.toThrow("name is required");
    });

    it("short-circuits an empty request list", async () => {
      expect(await makeClient().executeChangeSet([])).toEqual([]);
      expect(server.requests).toHaveLength(0);
    });
  });

  describe("errors", () => {
    it("throws CdsClientError with the platform message on failure", async () => {
      server.respondAlways({
        status: 400,
        responseText: JSON.stringify({ error: { message: "Attribute foo does not exist" } }),
      });
      await expect(makeClient().retrieveMultiple("accounts")).rejects.toThrow(
        "Attribute foo does not exist"
      );
      await expect(makeClient().retrieveMultiple("accounts")).rejects.toBeInstanceOf(
        CdsClientError
      );
    });

    it("falls back to a generic message for non-JSON error bodies", async () => {
      server.respondAlways({ status: 500, responseText: "<html>oops</html>" });
      await expect(makeClient().retrieveMultiple("accounts")).rejects.toThrow(
        "Dataverse request failed with status 500"
      );
    });
  });
});
