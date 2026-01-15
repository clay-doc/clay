import type {Configuration} from "~/assets/configuration";
import yaml from "js-yaml";

export function loadFromYamlConfig(yamlString: string): Configuration {
    return yaml.load(yamlString) as Configuration;
}