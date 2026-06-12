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

    it("executeWorkflow posts ExecuteWorkflow bound to the workflow record", async () => {
      server.respondAlways({ status: 200, responseText: "{}" });
      await makeClient().executeWorkflow(
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
