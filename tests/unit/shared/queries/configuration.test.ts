import { getConfigurationParameter } from "../../../../shared/queries/configuration";
import { createFakeViewModelContext } from "../../../mocks/fakeViewModelContext";

describe("getConfigurationParameter", () => {
  const options = {
    entity: "new_configuration",
    nameField: "new_name",
    valueField: "new_value",
    key: "ApiUrl",
  };

  it("returns the value field of the single matching row", async () => {
    const { context, calls } = createFakeViewModelContext({
      queryResults: {
        new_configuration: [{ entities: [{ new_value: "https://api.example.com" }] }],
      },
    });
    await expect(getConfigurationParameter(context, options)).resolves.toBe(
      "https://api.example.com"
    );
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    expect(query.args[0]).toBe("new_configuration");
    // The filter expression travels URL-encoded (a key like "a&b" would
    // otherwise restructure the query string).
    expect(decodeURIComponent(String(query.args[1]))).toContain("new_name eq 'ApiUrl'");
    expect(String(query.args[1])).toContain("$select=new_value");
  });

  it("throws 'not found' when nothing matches", async () => {
    const { context } = createFakeViewModelContext({
      queryResults: { new_configuration: [{ entities: [] }] },
    });
    await expect(getConfigurationParameter(context, options)).rejects.toThrow(
      /Configuration parameter 'ApiUrl' not found/
    );
  });

  it("throws 'duplicated' when more than one matches", async () => {
    const { context } = createFakeViewModelContext({
      queryResults: {
        new_configuration: [{ entities: [{ new_value: "a" }, { new_value: "b" }] }],
      },
    });
    await expect(getConfigurationParameter(context, options)).rejects.toThrow(
      /Duplicated configuration parameter 'ApiUrl'/
    );
  });
});
