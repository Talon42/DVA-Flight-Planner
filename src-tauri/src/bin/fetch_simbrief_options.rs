use std::{env, fs, path::PathBuf};

const INPUTS_LIST_URL: &str = "https://www.simbrief.com/api/inputs.list.json";
const INPUTS_AIRFRAMES_URL: &str = "https://www.simbrief.com/api/inputs.airframes.json";

async fn fetch_and_save(
    client: &reqwest::Client,
    output_dir: &PathBuf,
    url: &str,
    body_name: &str,
    meta_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let response = client.get(url).send().await?;
    let status = response.status();
    let body = response.text().await?;

    fs::write(output_dir.join(body_name), &body)?;
    fs::write(
        output_dir.join(meta_name),
        format!("url={url}\nstatus={status}\nbytes={}\n", body.len()),
    )?;

    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::async_runtime::block_on(async {
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
        let output_dir = manifest_dir.join("..").join("simbrief");
        fs::create_dir_all(&output_dir)?;

        let client = reqwest::Client::builder()
            .user_agent("flight-planner-app/diagnostic")
            .build()?;

        fetch_and_save(
            &client,
            &output_dir,
            INPUTS_LIST_URL,
            "inputs_list_dump.json",
            "inputs_list_dump_meta.txt",
        )
        .await?;

        fetch_and_save(
            &client,
            &output_dir,
            INPUTS_AIRFRAMES_URL,
            "inputs_airframes_dump.json",
            "inputs_airframes_dump_meta.txt",
        )
        .await?;

        Ok(())
    })
}
