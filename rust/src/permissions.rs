use serde::{Deserialize, Serialize};

use crate::api_types::User;

pub enum Action {
    Read,
    Create,
    Update,
    Delete,
}

#[derive(PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
pub enum Role {
    Any,
    User { id: String },
    Group { id: String },
}

#[derive(Serialize, Deserialize)]
pub struct Permissions {
    pub read: Vec<Role>,
    pub create: Vec<Role>,
    pub update: Vec<Role>,
    pub delete: Vec<Role>,
}

impl Permissions {
    pub fn empty() -> Self {
        Permissions {
            read: Vec::new(),
            create: Vec::new(),
            update: Vec::new(),
            delete: Vec::new(),
        }
    }

    pub fn check(&self, user: &User, action: Action) -> bool {
        let list = match action {
            Action::Read => &self.read,
            Action::Create => &self.create,
            Action::Update => &self.update,
            Action::Delete => &self.delete,
        };
        // TODO
        true
    }
}
